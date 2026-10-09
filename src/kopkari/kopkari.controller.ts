import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { KopkariService } from './kopkari.service';

class RegisterDto {
    @IsString() @MaxLength(80)
    riderName: string;

    @IsString() @MaxLength(30)
    phone: string;

    @IsOptional() @IsString() @MaxLength(60)
    horseName?: string;

    @IsOptional() @IsString() @MaxLength(60)
    horseBreed?: string;

    @IsOptional() @IsString() @MaxLength(300)
    note?: string;

    @IsOptional() @IsBoolean()
    showPublicly?: boolean;
}

class DecisionDto {
    @IsOptional() @IsString() @MaxLength(300)
    adminNote?: string;
}

class WinnerDto {
    @IsInt() @Min(1) @Max(100)
    place: number;

    @IsString() @MaxLength(80)
    riderName: string;

    @IsOptional() @IsString() @MaxLength(60)
    horseName?: string;

    @IsOptional() @IsString() @MaxLength(80)
    prize?: string;
}

class PhotoDto {
    @IsString() @MaxLength(1000)
    url: string;
}

class ResultsDto {
    @IsOptional() @IsString() @MaxLength(3000)
    resultsSummary?: string;

    @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => WinnerDto)
    winners?: WinnerDto[];

    @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PhotoDto)
    photos?: PhotoDto[];

    @IsOptional() @IsBoolean()
    markCompleted?: boolean;
}

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags("Ko'pkari: ishtirokchilar va natijalar")
@Controller()
export class KopkariController {
    constructor(private readonly kopkari: KopkariService) { }

    @Get('events/:id/my-registration')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async my(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.kopkari.myRegistration(id, user.id));
    }

    @Post('events/:id/register')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Ko'pkariga ishtirokchi sifatida ariza" })
    async register(@Param('id') id: string, @Body() dto: RegisterDto, @CurrentUser() user: User) {
        return ok(await this.kopkari.register(id, user.id, dto));
    }

    @Get('events/:id/participants')
    @ApiOperation({ summary: "Tasdiqlangan ishtirokchilar (ommaviy, telefonlarsiz)" })
    async participants(@Param('id') id: string) {
        return ok(await this.kopkari.participants(id));
    }

    @Delete('events/:id/register')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async cancel(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.kopkari.cancel(id, user.id));
    }

    @Get('admin/events/:id/registrations')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async list(@Param('id') id: string) {
        return ok(await this.kopkari.list(id));
    }

    @Post('admin/event-registrations/:id/approve')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async approve(@Param('id') id: string, @Body() dto: DecisionDto) {
        return ok(await this.kopkari.decide(id, true, dto.adminNote));
    }

    @Post('admin/event-registrations/:id/reject')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async reject(@Param('id') id: string, @Body() dto: DecisionDto) {
        return ok(await this.kopkari.decide(id, false, dto.adminNote));
    }

    @Post('admin/events/:id/registrations/export')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Tasdiqlangan ishtirokchilar CSV faylini adminning Telegram'iga yuborish" })
    async export(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.kopkari.exportToAdmin(id, user.id));
    }

    @Put('admin/events/:id/results')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async results(@Param('id') id: string, @Body() dto: ResultsDto) {
        return ok(await this.kopkari.saveResults(id, dto));
    }
}
