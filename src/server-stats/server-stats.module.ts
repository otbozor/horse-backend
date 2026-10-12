import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestStatsMiddleware, RequestStatsService } from './request-stats.service';
import { ServerStatsController } from './server-stats.controller';
import { ServerStatsService } from './server-stats.service';

@Module({
    controllers: [ServerStatsController],
    providers: [ServerStatsService, RequestStatsService],
})
export class ServerStatsModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        // Barcha API so'rovlari: soni, javob vaqti, xatolar
        consumer.apply(RequestStatsMiddleware).forRoutes('*');
    }
}
