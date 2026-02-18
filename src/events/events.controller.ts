import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Events')
@Controller('events')
export class EventsController {
    constructor(private eventsService: EventsService) { }

    @Get('upcoming')
    @ApiOperation({ summary: 'Get upcoming events' })
    async getUpcomingEvents(@Query('limit') limit?: string) {
        const events = await this.eventsService.getUpcomingEvents(
            limit ? parseInt(limit) : 6
        );

        return {
            success: true,
            data: events,
            message: 'Upcoming events retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':slug')
    @ApiOperation({ summary: 'Get event by slug' })
    async getEventBySlug(@Param('slug') slug: string) {
        const event = await this.eventsService.getEventBySlug(slug);

        if (!event) {
            return {
                success: false,
                data: null,
                message: 'Event not found',
                timestamp: new Date().toISOString(),
            };
        }

        return {
            success: true,
            data: event,
            message: 'Event retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get()
    @ApiOperation({ summary: 'Get all events' })
    async getAllEvents(
        @Query('regionId') regionId?: string,
        @Query('upcoming') upcoming?: string,
        @Query('past') past?: string,
    ) {
        const events = await this.eventsService.getAllEvents({
            regionId,
            upcoming: upcoming === 'true',
            past: past === 'true',
        });

        return {
            success: true,
            data: events,
            message: 'Events retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
