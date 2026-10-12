import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { Range, ServerStatsService } from './server-stats.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Admin')
@Controller('admin/server-stats')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class ServerStatsController {
    constructor(private readonly stats: ServerStatsService) { }

    @Get()
    async summary(@Query('range') range?: string) {
        const r: Range = range === '7d' || range === '30d' ? range : '24h';
        return ok(await this.stats.summary(r));
    }
}
