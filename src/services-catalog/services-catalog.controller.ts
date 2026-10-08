import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ServiceCategory, ServiceStatus, User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesCatalogService } from './services-catalog.service';

class MediaDto {
    @IsString()
    @MaxLength(1000)
    url: string;
}

class ServiceDto {
    @IsEnum(ServiceCategory)
    category: ServiceCategory;

    @IsString()
    @MaxLength(120)
    title: string;

    @IsOptional() @IsString() @MaxLength(3000)
    description?: string;

    @IsOptional() @IsUUID()
    regionId?: string;

    @IsOptional() @IsUUID()
    districtId?: string;

    @IsOptional() @IsNumber() @Min(0)
    priceFrom?: number | null;

    @IsOptional() @IsString() @MaxLength(60)
    priceNote?: string;

    @IsOptional() @IsString() @MaxLength(80)
    contactName?: string;

    @IsOptional() @IsString() @MaxLength(30)
    contactPhone?: string;

    @IsOptional() @IsString() @MaxLength(64)
    contactTelegram?: string;

    @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => MediaDto)
    media?: MediaDto[];
}

class RejectDto {
    @IsString()
    @MaxLength(500)
    reason: string;
}

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Xizmatlar katalogi')
@Controller()
export class ServicesCatalogController {
    constructor(
        private readonly services: ServicesCatalogService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    /** Ixtiyoriy autentifikatsiya: egasi yoki admin moderatsiyadagi xizmatni ham ko'ra olsin */
    private async optionalViewer(req: Request) {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) return undefined;
        try {
            const payload = this.jwt.verify(header.slice(7), { secret: this.config.get<string>('JWT_SECRET') });
            const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, isAdmin: true, status: true } });
            return u && u.status === 'ACTIVE' ? { id: u.id, isAdmin: u.isAdmin } : undefined;
        } catch {
            return undefined;
        }
    }

    @Get('services')
    @ApiOperation({ summary: "Tasdiqlangan xizmatlar ro'yxati" })
    async list(
        @Query('category') category?: string,
        @Query('regionId') regionId?: string,
        @Query('q') q?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return ok(await this.services.findAll({ category, regionId, q, page: Number(page), limit: Number(limit) }));
    }

    @Get('services/categories')
    async categories() {
        return ok(await this.services.categoryCounts());
    }

    @Get('services/:id')
    async one(@Param('id') id: string, @Req() req: Request) {
        return ok(await this.services.findOne(id, await this.optionalViewer(req)));
    }

    @Post('services/:id/view')
    async view(@Param('id') id: string) {
        this.services.trackView(id).catch(() => { });
        return ok(null);
    }

    @Get('my/services')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async mine(@CurrentUser() user: User) {
        return ok(await this.services.findMine(user.id));
    }

    @Post('my/services')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Xizmat joylash (bepul, admin tasdig\'i bilan)' })
    async create(@Body() dto: ServiceDto, @CurrentUser() user: User) {
        return ok(await this.services.create(user.id, dto));
    }

    @Patch('my/services/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async update(@Param('id') id: string, @Body() dto: ServiceDto, @CurrentUser() user: User) {
        return ok(await this.services.update(user.id, id, dto, user.isAdmin));
    }

    @Delete('my/services/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async archive(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.services.archive(user.id, id, user.isAdmin));
    }

    @Get('admin/services')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async adminList(@Query('status') status?: ServiceStatus) {
        const s = status && Object.values(ServiceStatus).includes(status) ? status : ServiceStatus.PENDING;
        return ok(await this.services.adminList(s));
    }

    @Post('admin/services/:id/approve')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async approve(@Param('id') id: string) {
        return ok(await this.services.approve(id));
    }

    @Post('admin/services/:id/reject')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async reject(@Param('id') id: string, @Body() dto: RejectDto) {
        return ok(await this.services.reject(id, dto.reason));
    }
}
