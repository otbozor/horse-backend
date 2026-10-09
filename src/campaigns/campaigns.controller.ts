import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

class CampaignDto {
    @IsString() @MaxLength(80)
    name: string;

    @IsOptional() @IsString() @MaxLength(40)
    code?: string;

    @IsOptional() @IsString() @MaxLength(120)
    targetPath?: string;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
}

class CampaignUpdateDto {
    @IsOptional() @IsString() @MaxLength(80)
    name?: string;

    @IsOptional() @IsString() @MaxLength(120)
    targetPath?: string;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
}

@ApiTags('Campaigns')
@Controller()
@ApiBearerAuth()
export class CampaignsController {
    constructor(private readonly campaigns: CampaignsService) { }

    /** Mini App ad_<code> havolasi bilan ochilganda */
    @Post('campaigns/:code/open')
    @UseGuards(JwtAuthGuard)
    async open(@CurrentUser() user: User, @Param('code') code: string) {
        return ok(await this.campaigns.open(code, user.id));
    }

    @Get('admin/campaigns')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async list() {
        return ok(await this.campaigns.list());
    }

    @Post('admin/campaigns')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async create(@Body() body: CampaignDto) {
        return ok(await this.campaigns.create(body));
    }

    @Patch('admin/campaigns/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async update(@Param('id') id: string, @Body() body: CampaignUpdateDto) {
        return ok(await this.campaigns.update(id, body));
    }

    @Delete('admin/campaigns/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async remove(@Param('id') id: string) {
        return ok(await this.campaigns.remove(id));
    }
}
