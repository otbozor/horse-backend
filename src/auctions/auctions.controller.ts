import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { User } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { optionalUserId } from '../common/viewer.util';
import { AuctionsService } from './auctions.service';

class CreateAuctionDto {
    @IsNumber() @Min(1)
    startPrice: number;

    @IsOptional() @IsNumber() @Min(1)
    minStep?: number;

    @IsIn([1, 3, 5, 7])
    durationDays: number;
}

class BidDto {
    @IsNumber() @Min(1)
    amount: number;
}

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Auctions')
@Controller()
export class AuctionsController {
    constructor(private readonly auctions: AuctionsService) { }

    @Get('auctions')
    @ApiOperation({ summary: 'Faol auksionlar' })
    async list() {
        return ok(await this.auctions.listActive());
    }

    @Get('listings/:id/auction')
    async forListing(@Param('id') id: string, @Req() req: Request) {
        return ok(await this.auctions.forListing(id, optionalUserId(req)));
    }

    @Post('my/listings/:id/auction')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "E'lonni auksionga qo'yish" })
    async create(@Param('id') id: string, @Body() dto: CreateAuctionDto, @CurrentUser() user: User) {
        return ok(await this.auctions.create(id, user.id, dto));
    }

    @Delete('auctions/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async cancel(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.auctions.cancel(id, user.id, user.isAdmin));
    }

    @Post('auctions/:id/bids')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Taklif berish' })
    async bid(@Param('id') id: string, @Body() dto: BidDto, @CurrentUser() user: User) {
        return ok(await this.auctions.bid(id, user.id, dto.amount));
    }
}
