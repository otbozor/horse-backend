import { Module } from '@nestjs/common';
import { AppStatsController } from './app-stats.controller';
import { AppStatsService } from './app-stats.service';

@Module({
    controllers: [AppStatsController],
    providers: [AppStatsService],
})
export class AppStatsModule { }
