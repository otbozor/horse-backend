import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { anonViewerKey, optionalUserId } from '../common/viewer.util';
import { AppStatsService } from './app-stats.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

class PingDto {
    @IsString() @MaxLength(64)
    installId: string;

    @IsOptional() @IsString() @MaxLength(16)
    version?: string;

    @IsOptional() @IsString() @MaxLength(32)
    webVersion?: string;
}

@ApiTags('App')
@Controller()
export class AppStatsController {
    constructor(private readonly stats: AppStatsService) { }

    /** Yuklab olish tugmalari shu yerga: sanaladi va APK ga yo'naltiriladi */
    @Get('app/download')
    async download(@Query('src') src: string | undefined, @Req() req: Request, @Res() res: Response) {
        await this.stats.recordDownload(src, anonViewerKey(req)).catch(() => undefined);
        res.redirect(302, this.stats.apkUrl);
    }

    /** Ilova ochilganda (ixtiyoriy token — kirgan bo'lsa foydalanuvchiga bog'lanadi) */
    @Post('app/ping')
    async ping(@Body() body: PingDto, @Req() req: Request) {
        return ok(await this.stats.ping(body.installId, body.version ?? 'unknown', optionalUserId(req), body.webVersion));
    }

    @Get('admin/app-stats')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async summary() {
        return ok(await this.stats.summary());
    }
}
