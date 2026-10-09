import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatUpdate } from './chat.update';

@Module({
    controllers: [ChatController],
    providers: [ChatService, ChatUpdate],
    exports: [ChatService],
})
export class ChatModule { }
