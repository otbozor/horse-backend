import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Audience, GrowthService } from './growth.service';
import { DigestService } from './digest.service';

class BroadcastDto {
    @IsString() @MaxLength(4000)
    text: string;

    @IsOptional() @IsString() @MaxLength(1000)
    imageUrl?: string;

    @IsOptional() @IsString() @MaxLength(40)
    buttonText?: string;

    @IsOptional() @IsString() @MaxLength(200)
    buttonPath?: string;

    @IsOptional() @IsIn(['ALL', 'SELLERS', 'BUYERS', 'ADMINS'])
    audience?: Audience;

    @IsOptional() @IsBoolean()
    testOnly?: boolean;
}

class BannerDto {
    @IsString() @MaxLength(80)
    title: string;

    @IsOptional() @IsString() @MaxLength(160)
    subtitle?: string;

    @IsOptional() @IsString() @MaxLength(1000)
    imageUrl?: string;

    @IsOptional() @IsString() @MaxLength(500)
    link?: string;

    @IsOptional() @IsString() @MaxLength(100)
    bgColor?: string;

    @IsOptional() @IsBoolean()
    isActive?: boolean;

    @IsOptional() @IsInt() @Min(0) @Max(1000)
    sortOrder?: number;

    @IsOptional() @IsDateString()
    startsAt?: string | null;

    @IsOptional() @IsDateString()
    endsAt?: string | null;
}

class ReferralConfigDto {
    @IsOptional() @IsBoolean()
    enabled?: boolean;

    @IsOptional() @IsInt() @Min(0) @Max(100)
    inviterReward?: number;

    @IsOptional() @IsInt() @Min(0) @Max(100)
    inviteeReward?: number;
}

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags("O'sish: broadcast, bannerlar, referal")
@Controller()
export class GrowthController {
    constructor(
        private readonly growth: GrowthService,
        private readonly prisma: PrismaService,
        private readonly digest: DigestService,
    ) { }

    // ---------- Bannerlar (ommaviy) ----------

    @Get('banners')
    async banners() {
        return ok(await this.growth.activeBanners());
    }

    @Post('banners/:id/click')
    async bannerClick(@Param('id') id: string) {
        this.growth.bannerClick(id).catch(() => { });
        return ok(null);
    }

    // ---------- Bildirishnomalar ----------

    @Get('my/notifications')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async myNotifications(@CurrentUser() user: User) {
        const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { digestEnabled: true } });
        return ok({ digestEnabled: u?.digestEnabled ?? true });
    }

    @Put('my/notifications')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async setNotifications(@CurrentUser() user: User, @Body() body: { digestEnabled?: boolean }) {
        return ok(await this.digest.setEnabled(user.id, body?.digestEnabled !== false));
    }

    @Get('admin/digest/settings')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async digestSettings() {
        return ok(await this.digest.adminSettings());
    }

    @Put('admin/digest/settings')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async setDigestSettings(@Body() body: { enabled?: boolean }) {
        return ok(await this.digest.setGloballyEnabled(body?.enabled === true));
    }

    @Post('admin/digest/test')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async digestTest(@CurrentUser() user: User) {
        return ok(await this.digest.sendTest(user.id));
    }

    // ---------- Referal ----------

    @Get('my/referral')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async myReferral(@CurrentUser() user: User) {
        return ok(await this.growth.myReferral(user.id));
    }

    // ---------- Admin ----------

    @Get('admin/broadcasts')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async broadcasts() {
        const [history, audiences] = await Promise.all([this.growth.broadcastHistory(), this.growth.audienceCounts()]);
        return ok({ history, audiences });
    }

    @Post('admin/broadcasts')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Ommaviy xabar (testOnly=true - faqat o'zingizga)" })
    async broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: User) {
        return ok(await this.growth.broadcast(user.id, dto));
    }

    @Get('admin/banners')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async adminBanners() {
        return ok(await this.growth.allBanners());
    }

    @Post('admin/banners')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async createBanner(@Body() dto: BannerDto) {
        return ok(await this.growth.createBanner(dto));
    }

    @Patch('admin/banners/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async updateBanner(@Param('id') id: string, @Body() dto: BannerDto) {
        return ok(await this.growth.updateBanner(id, dto));
    }

    @Delete('admin/banners/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async deleteBanner(@Param('id') id: string) {
        return ok(await this.growth.deleteBanner(id));
    }

    @Get('admin/referral')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async referralAdmin() {
        const [config, top, total, rewarded] = await Promise.all([
            this.growth.referralConfig(),
            this.growth.topReferrers(),
            this.prisma.user.count({ where: { referredById: { not: null } } }),
            this.prisma.user.count({ where: { referralRewardedAt: { not: null } } }),
        ]);
        return ok({ config, top, total, rewarded });
    }

    @Put('admin/referral')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async updateReferral(@Body() dto: ReferralConfigDto) {
        const upsert = (key: string, value: string) =>
            this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
        const ops = [];
        if (dto.enabled !== undefined) ops.push(upsert('referral_enabled', String(dto.enabled)));
        if (dto.inviterReward !== undefined) ops.push(upsert('referral_reward_inviter', String(dto.inviterReward)));
        if (dto.inviteeReward !== undefined) ops.push(upsert('referral_reward_invitee', String(dto.inviteeReward)));
        await Promise.all(ops);
        return ok(await this.growth.referralConfig());
    }
}
