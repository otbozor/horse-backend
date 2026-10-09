import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Notifications')
@Controller('my/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) { }

    @Get()
    async prefs(@CurrentUser() user: User) {
        return ok(await this.notifications.prefs(user.id));
    }

    @Put()
    async update(@CurrentUser() user: User, @Body() body: { digestEnabled?: boolean; categories?: Record<string, boolean> }) {
        return ok(await this.notifications.updatePrefs(user.id, body ?? {}));
    }

    @Get('inbox')
    async inbox(@CurrentUser() user: User, @Query('page') page?: string) {
        return ok(await this.notifications.list(user.id, Number(page) || 1));
    }

    @Get('unread-count')
    async unread(@CurrentUser() user: User) {
        return ok({ unread: await this.notifications.unreadCount(user.id) });
    }

    @Post('read-all')
    async readAll(@CurrentUser() user: User) {
        return ok(await this.notifications.markAllRead(user.id));
    }

    @Post(':id/read')
    async read(@CurrentUser() user: User, @Param('id') id: string) {
        return ok(await this.notifications.markRead(user.id, id));
    }
}
