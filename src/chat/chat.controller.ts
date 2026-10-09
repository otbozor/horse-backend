import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
    constructor(private readonly chat: ChatService) { }

    @Post('open')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Sotuvchi bilan bot orqali yashirin suhbat ochish" })
    async open(@Body() body: { listingId: string }, @CurrentUser() user: User) {
        return ok(await this.chat.open(body.listingId, user.id));
    }
}
