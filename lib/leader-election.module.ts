import { DynamicModule, Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { LeaderElectionHelper } from "./LeaderElectionHelper";

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [LeaderElectionHelper],
  exports: [LeaderElectionHelper],
})
export class LeaderElectionModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          provide: LeaderElectionHelper,
          useFactory: (): LeaderElectionHelper => {
            return new LeaderElectionHelper();
          },
          inject: [LeaderElectionHelper],
        },
      ],
      exports: [LeaderElectionHelper],
    };
  }
}
export default LeaderElectionModule;
