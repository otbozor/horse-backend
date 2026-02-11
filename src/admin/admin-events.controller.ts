import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from '../events/events.service';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}

@ApiTags('Admin Events')
@Controller('admin/events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminEventsController {
    constructor(
        private readonly eventsService: EventsService,
        private readonly adminService: AdminService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Get all events (admin)' })
    async getAllEvents(@CurrentUser() user: User): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.eventsService.getAllEvents({ allStatuses: true });
        return {
            success: true,
            data,
            message: 'Events retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post()
    @ApiOperation({ summary: 'Create new event' })
    async createEvent(
        @CurrentUser() user: User,
        @Body() body: any,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.eventsService.createEvent(body);
        return {
            success: true,
            data,
            message: 'Event created successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update event' })
    async updateEvent(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() body: any,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.eventsService.updateEvent(id, body);
        return {
            success: true,
            data,
            message: 'Event updated successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/publish')
    @ApiOperation({ summary: 'Publish event' })
    async publishEvent(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.eventsService.publishEvent(id);
        return {
            success: true,
            data,
            message: 'Event published successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete event' })
    async deleteEvent(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        await this.eventsService.deleteEvent(id);
        return {
            success: true,
            message: 'Event deleted successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
