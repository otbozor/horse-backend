import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram.service';
import { TelegramChannelService } from './telegram-channel.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TelegrafModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                token: configService.get<string>('TELEGRAM_BOT_TOKEN'),
            }),
            inject: [ConfigService],
        }),
        AuthModule,
    ],
    providers: [TelegramBotService, TelegramChannelService],
    exports: [TelegramBotService, TelegramChannelService],
})
export class TelegramModule { }
