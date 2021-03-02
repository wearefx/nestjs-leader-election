import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { v4, validate, version } from "uuid";
import { RedisClientService } from "./RedisClient.service";
import {
  HEARTBEAT_INTERVAL,
  TERM_MAXIMUM_FACTOR,
  TERM_MINIMUM_FACTOR,
} from "./Constants";
import { randomNumber } from "./utils";

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  private nodeId: Readonly<string> = Object.freeze(v4());

  private leaderId: string | null = null;

  private activeNodeTimestamps: { [key: string]: Date } = {};

  private isInElection = false;

  private votesForMe = 0;

  constructor(private redisService: RedisClientService) {
    this.logger.log(`This Node ID: ${this.nodeId}`);

    this.redisService.publisherClient.nodeRedis.on(
      "message",
      async (channel, message) => {
        if (channel === this.redisService.getHeartbeatChannelName()) {
          if (validate(message) && version(message) === 4) {
            if (!(this.activeNodeTimestamps[message] instanceof Date)) {
              this.logger.log(`Found new Node: ${message}`);
            }
            this.activeNodeTimestamps[message] = new Date();
          } else {
            this.logger.warn(
              "Message in heartbeat channel was not a valid UUIDv4."
            );
          }
        } else if (channel === this.redisService.getClaimPowerChannelName()) {
          if (validate(message) && version(message) === 4) {
            this.leaderId = message;
            this.isInElection = false;
            this.votesForMe = 0;

            this.logger.log(`The leader is now [${message}]`);

            if (message === this.nodeId) {
              this.logger.log(`I am the LEADER.`);
            } else {
              this.logger.log(`I am a FOLLOWER.`);
            }
          }
        } else if (channel === this.redisService.getVoteChannelName()) {
          if (
            validate(message) &&
            version(message) === 4 &&
            message === this.nodeId
          ) {
            this.votesForMe += 1;
            this.logger.debug("A node voted for me.");

            if (
              this.inElection() &&
              this.votesForMe >= this.getMajorityRequiredSize()
            ) {
              await this.claimPower();
            }
          } else {
            this.logger.debug("A vote for a different node.");
          }
        } else if (channel === this.redisService.getCallElectionChannelName()) {
          if (validate(message) && version(message) === 4) {
            this.isInElection = true;
            await this.voteInElection(message);
          }
        } else {
          this.logger.warn(`Invalid channel name: ${channel}`);
        }
      }
    );

    // Finally subscribe to the heartbeat channel to receive heartbeats from the other nodes.
    this.redisService.publisherClient.nodeRedis.subscribe(
      this.redisService.getHeartbeatChannelName()
    );

    this.redisService.publisherClient.nodeRedis.subscribe(
      this.redisService.getClaimPowerChannelName()
    );

    this.redisService.publisherClient.nodeRedis.subscribe(
      this.redisService.getCallElectionChannelName()
    );

    this.redisService.publisherClient.nodeRedis.subscribe(
      this.redisService.getVoteChannelName()
    );

    this.callElection();
  }

  /**
   * At the agreed intervals, emit a heartbeat to the channel.
   */
  @Interval(HEARTBEAT_INTERVAL)
  async postHeartbeat(): Promise<void> {
    await this.redisService.emitHeartbeart(this.nodeId);
  }

  removeNodeFromList(nodeId: string): void {
    delete this.activeNodeTimestamps[nodeId];
    this.logger.log(`Removed node [${nodeId}] from the list.`);
  }

  @Interval(HEARTBEAT_INTERVAL)
  async clearNonActiveNodes(): Promise<void> {
    const nodeIds = Object.keys(this.activeNodeTimestamps);
    const now = new Date();

    nodeIds.forEach((nodeId) => {
      let remove = false;
      if (validate(nodeId) && version(nodeId) === 4) {
        if (typeof this.activeNodeTimestamps[nodeId] !== "undefined") {
          if (this.activeNodeTimestamps[nodeId] instanceof Date) {
            const diff =
              now.valueOf() - this.activeNodeTimestamps[nodeId].valueOf();
            // Remove the node if the heartbeat was too far away :(
            if (diff > HEARTBEAT_INTERVAL * 2) {
              remove = true;
            }
          } else {
            remove = true;
          }
        } else {
          remove = true;
        }
      } else {
        remove = true;
      }

      if (remove) {
        this.removeNodeFromList(nodeId);
      }
    });
  }

  async claimPower(): Promise<void> {
    this.logger.log("Claiming Power");
    this.isInElection = false;
    await this.redisService.claimPower(this.nodeId);
  }

  async callElection(): Promise<void> {
    if (!this.isInElection) {
      this.logger.log("Calling an election");
      this.isInElection = true;
      await this.redisService.callElection(this.nodeId);
    }
  }

  async voteInElection(nodeIdThatCalledElection: string): Promise<void> {
    await this.postHeartbeat();
    await this.clearNonActiveNodes();

    if (this.isInElection) {
      await this.redisService.placeVote(nodeIdThatCalledElection);
    }
  }

  async leaderIsConnected(): Promise<boolean> {
    const existingLeader = this.leaderId;
    this.clearNonActiveNodes();

    if (existingLeader === null) {
      return false;
    }
    const nodeIds = Object.keys(this.activeNodeTimestamps);

    if (nodeIds.includes(existingLeader)) {
      return true;
    }

    return false;
  }

  @Interval(
    randomNumber(
      HEARTBEAT_INTERVAL * TERM_MINIMUM_FACTOR,
      HEARTBEAT_INTERVAL * TERM_MAXIMUM_FACTOR
    )
  )
  async checkTheLeader(): Promise<void> {
    const existingLeader = this.leaderId;

    if (existingLeader === null) {
      await this.callElection();
    } else {
      if ((await this.leaderIsConnected()) === true) {
        // safe, existing leader exists no cap
        return undefined;
      }

      // heck oh no the leader aint there no more
      await this.callElection();
    }

    return undefined;
  }

  /**
   * Retrieve the number of active nodes in the network.
   */
  getActiveNetworkSize(): number {
    return Object.values(this.activeNodeTimestamps).length;
  }

  /**
   * Retrieve the number of votes needed for a candidate to become the leader.
   */
  getMajorityRequiredSize(): number {
    return Math.floor(this.getActiveNetworkSize() / 2) + 1;
  }

  /**
   * Determine if this node is the cluster leader.
   */
  thisNodeIsLeader(): boolean {
    return this.leaderId === this.nodeId;
  }

  /**
   * Determines if there is currently an election happening.
   */
  inElection(): boolean {
    return this.isInElection;
  }
}

export default HeartbeatService;
