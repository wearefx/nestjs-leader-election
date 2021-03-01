# @fxdigital/nestjs-leader-election

NestJS is a great backend framework for developing microservices and such like. This is a module for NestJS which elects an instance as a leader through quasi-Raft Consensus and uses a common Redis install as a broker and Redis channels for pub/sub. Essentially, multiple instances of the same running microservice can orchestrate between themselves who the Leader is, without a central server to detect downtime and promote followers to leaders. The leader can then perform special, singleton roles.

## Get started

This repo uses yarn version 2 and 'zero installs'.

- `make setup-ide`

Then run `make build` (or `make build.watch` for `tsc -w` watching.)

Write tests in `__tests__` directory mirroring the structure of the `lib` directory and run them using `make test`.

## Motivation

In one of our projects, we use NestJS/Bull job queues to process long-running tasks and tasks which can be processed in the future. Jobs are created when certain new events from EventStore are received. However in EventStore, Catch Up subscriptions cannot be used with consumer groups, and scaling the number of instances running would not be possible as each would be listening to events and placing them on the job queue (multiple jobs for the same event). We use this module to elect a leader and it is the single leader's job to place new events onto the queue - followers only work from the jobs queue.

Raft was used as there was no scope to build another central server to orchestrate this, or another binary just to add events to the job queue and Redis was used as the broker as it is already used for the Bull job queue.

## Flow

1. Instances can subscribe to multiple Redis channels (handled internally) and they ping each other each X milliseconds with a heartbeat, confirming that they are up to one another.
1. Each instance maintains a local copy of the node Ids which are up, which means that instances' system clocks don't need to be synchronized. Node Ids are removed from the (using NestJS cron jobs) if a heartbeat is not received within Y milliseconds.
1. After a random amount of time (different for each instance), one instance might detect that the leader Node ID is no longer included in the list of active Node IDs and then it calls an election.
1. Nodes take part in the election and vote for the node which called the election. Once a majority of nodes have voted for the caller, then it claims power. Note: this (claiming power rather than assuming power) is slightly different to Raft Consensus as the emphasis in this implementation has been about the speed of electing a new leader, rather than integrity - the instances just need a leader urgently.

## CI

Uses FX Digital hosted Git*Lab* CI pipelines for build, test and deploy to NPM.
