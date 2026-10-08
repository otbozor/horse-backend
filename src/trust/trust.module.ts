import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TrustController } from './trust.controller';
import { TrustService } from './trust.service';

@Module({
    imports: [TelegramModule],
    controllers: [TrustController],
    providers: [TrustService],
})
export class TrustModule { }
