import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TelegramModule } from '../telegram/telegram.module';
import { EngagementController } from './engagement.controller';
import { RequestsService } from './requests.service';
import { SavedSearchService } from './saved-search.service';

@Module({
    imports: [TelegramModule, JwtModule.register({})],
    controllers: [EngagementController],
    providers: [SavedSearchService, RequestsService],
    exports: [SavedSearchService],
})
export class EngagementModule { }
