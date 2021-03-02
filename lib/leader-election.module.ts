import { DynamicModule, Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HeartbeatService } from "./Heartbeat.service";
import { LeaderElectionHelper } from "./LeaderElectionHelper";
import { RedisClientService } from "./RedisClient.service";

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [LeaderElectionHelper, RedisClientService, HeartbeatService],
  exports: [LeaderElectionHelper],
})
export class LeaderElectionModule {
  static forRoot(redisConfig: {
    host: string;
    port: number;
    db: number;
    prefix: string;
  }): DynamicModule {
    return {
      module: LeaderElectionModule,
      providers: [
        {
          provide: RedisClientService,
          useValue: new RedisClientService(redisConfig),
        },
        {
          provide: HeartbeatService,
          useFactory: (
            redisClientService: RedisClientService
          ): HeartbeatService => {
            return new HeartbeatService(redisClientService);
          },
          inject: [RedisClientService],
        },
        {
          provide: LeaderElectionHelper,
          useFactory: (
            heartbeatService: HeartbeatService
          ): LeaderElectionHelper => {
            return new LeaderElectionHelper(heartbeatService);
          },
          inject: [HeartbeatService],
        },
      ],
      exports: [LeaderElectionHelper],
    };
  }
}
export default LeaderElectionModule;
