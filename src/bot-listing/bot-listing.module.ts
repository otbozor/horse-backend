import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ListingsModule } from '../listings/listings.module';
import { MediaModule } from '../media/media.module';
import { BotListingService } from './bot-listing.service';
import { BotListingUpdate } from './bot-listing.update';

/** Botga rasm + matn yuborib e'lon joylash */
@Module({
    imports: [ChatModule, ListingsModule, MediaModule],
    providers: [BotListingService, BotListingUpdate],
})
export class BotListingModule { }
