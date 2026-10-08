import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { HorseGender, HorsePurpose, User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SavedSearchService } from './saved-search.service';
import { RequestsService } from './requests.service';

class SavedSearchDto {
    @IsOptional() @IsString() @MaxLength(60)
    label?: string;

    @IsObject()
    filters: Record<string, unknown>;
}

class SavedSearchUpdateDto {
    @IsOptional() @IsBoolean()
    isActive?: boolean;

    @IsOptional() @IsString() @MaxLength(60)
    label?: string;
}

class RequestDto {
    @IsString() @MaxLength(120)
    title: string;

    @IsOptional() @IsString() @MaxLength(2000)
    description?: string;

    @IsOptional() @IsEnum(HorsePurpose)
    purpose?: HorsePurpose;

    @IsOptional() @IsEnum(HorseGender)
    gender?: HorseGender;

    @IsOptional() @IsUUID()
    breedId?: string;

    @IsOptional() @IsInt() @Min(0) @Max(40)
    ageMin?: number;

    @IsOptional() @IsInt() @Min(0) @Max(40)
    ageMax?: number;

    @IsOptional() @IsNumber() @Min(0)
    budgetMax?: number;

    @IsOptional() @IsUUID()
    regionId?: string;

    @IsOptional() @IsString() @MaxLength(30)
    contactPhone?: string;

    @IsOptional() @IsString() @MaxLength(64)
    contactTelegram?: string;
}

class RespondDto {
    @IsOptional() @IsUUID()
    listingId?: string;

    @IsOptional() @IsString() @MaxLength(500)
    message?: string;
}

class StatusDto {
    @IsBoolean()
    active: boolean;
}

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags("Saqlangan qidiruv va 'Ot kerak' so'rovlari")
@Controller()
export class EngagementController {
    constructor(
        private readonly searches: SavedSearchService,
        private readonly requests: RequestsService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) { }

    private viewerId(req: Request): string | undefined {
        const h = req.headers.authorization;
        if (!h?.startsWith('Bearer ')) return undefined;
        try {
            return this.jwt.verify(h.slice(7), { secret: this.config.get<string>('JWT_SECRET') }).sub;
        } catch {
            return undefined;
        }
    }

    // ---------- Saqlangan qidiruv ----------

    @Get('my/saved-searches')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async searchesList(@CurrentUser() user: User) {
        return ok(await this.searches.list(user.id));
    }

    @Post('my/saved-searches')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Qidiruvni saqlash: mos yangi e\'lon chiqsa bot xabar beradi' })
    async searchesCreate(@Body() dto: SavedSearchDto, @CurrentUser() user: User) {
        return ok(await this.searches.create(user.id, dto.label ?? '', dto.filters));
    }

    @Patch('my/saved-searches/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async searchesUpdate(@Param('id') id: string, @Body() dto: SavedSearchUpdateDto, @CurrentUser() user: User) {
        return ok(await this.searches.update(user.id, id, dto));
    }

    @Delete('my/saved-searches/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async searchesRemove(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.searches.remove(user.id, id));
    }

    // ---------- "Ot kerak" so'rovlari ----------

    @Get('requests')
    async requestsList(
        @Query('purpose') purpose?: string,
        @Query('regionId') regionId?: string,
        @Query('q') q?: string,
        @Query('page') page?: string,
    ) {
        return ok(await this.requests.list({ purpose, regionId, q, page: Number(page) }));
    }

    @Get('requests/:id')
    async requestsOne(@Param('id') id: string, @Req() req: Request) {
        return ok(await this.requests.findOne(id, this.viewerId(req)));
    }

    @Post('requests/:id/respond')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "So'rovga javob: o'z otini taklif qilish yoki xabar yozish" })
    async requestsRespond(@Param('id') id: string, @Body() dto: RespondDto, @CurrentUser() user: User) {
        return ok(await this.requests.respond(user.id, id, dto.listingId, dto.message));
    }

    @Get('my/requests')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async requestsMine(@CurrentUser() user: User) {
        return ok(await this.requests.mine(user.id));
    }

    @Post('my/requests')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async requestsCreate(@Body() dto: RequestDto, @CurrentUser() user: User) {
        return ok(await this.requests.create(user.id, dto));
    }

    @Patch('my/requests/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async requestsUpdate(@Param('id') id: string, @Body() dto: RequestDto, @CurrentUser() user: User) {
        return ok(await this.requests.update(user.id, id, dto));
    }

    @Post('my/requests/:id/status')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async requestsStatus(@Param('id') id: string, @Body() dto: StatusDto, @CurrentUser() user: User) {
        return ok(await this.requests.setStatus(user.id, id, dto.active));
    }

    @Get('admin/requests')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async adminRequests() {
        return ok(await this.requests.adminList());
    }

    @Delete('admin/requests/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async adminRequestRemove(@Param('id') id: string) {
        return ok(await this.requests.adminRemove(id));
    }
}
