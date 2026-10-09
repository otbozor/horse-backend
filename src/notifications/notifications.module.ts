import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { BotStatusUpdate } from './bot-status.update';

@Global()
@Module({
    controllers: [NotificationsController],
    providers: [NotificationsService, BotStatusUpdate],
    exports: [NotificationsService],
})
export class NotificationsModule { }
