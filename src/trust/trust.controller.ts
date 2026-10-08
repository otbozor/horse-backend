import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ReportReason, ReportStatus, User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TrustService } from './trust.service';

class CreateReportDto {
    @IsEnum(ReportReason)
    reason: ReportReason;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    comment?: string;
}

class ReviewDto {
    @IsInt()
    @Min(1)
    @Max(5)
    stars: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    comment?: string;

    @IsOptional()
    @IsUUID()
    listingId?: string;
}

class ReplyDto {
    @IsString()
    @MaxLength(1000)
    reply: string;
}

class OfferDto {
    @IsNumber()
    @Min(1)
    amount: number;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    message?: string;
}

class PriceDto {
    @IsNumber()
    @Min(1)
    priceAmount: number;
}

class ResolveReportDto {
    @IsIn(['dismiss', 'resolve', 'archive'])
    action: 'dismiss' | 'resolve' | 'archive';
}

const ok = <T>(data: T, message = 'OK') => ({ success: true, data, message, timestamp: new Date().toISOString() });

@ApiTags('Trust: shikoyat, sharh, narx taklifi')
@Controller()
export class TrustController {
    constructor(private readonly trust: TrustService) { }

    // ---------- Shikoyat ----------

    @Post('listings/:id/report')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "E'longa shikoyat qilish" })
    async report(@Param('id') id: string, @Body() dto: CreateReportDto, @CurrentUser() user: User) {
        return ok(await this.trust.createReport(user.id, id, dto.reason, dto.comment), 'Shikoyat yuborildi');
    }

    @Get('admin/reports')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async reports(@Query('status') status?: ReportStatus) {
        const s = status && Object.values(ReportStatus).includes(status) ? status : ReportStatus.PENDING;
        return ok(await this.trust.getReports(s));
    }

    @Post('admin/reports/:id/resolve')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async resolveReport(@Param('id') id: string, @Body() dto: ResolveReportDto) {
        return ok(await this.trust.resolveReport(id, dto.action));
    }

    // ---------- Sharhlar ----------

    @Get('users/:id/reviews')
    @ApiOperation({ summary: 'Sotuvchi sharhlari va o\'rtacha baho' })
    async reviews(@Param('id') id: string) {
        return ok(await this.trust.getSellerReviews(id));
    }

    @Get('users/:id/rating')
    async rating(@Param('id') id: string) {
        return ok(await this.trust.getRatingSummary(id));
    }

    @Post('users/:id/reviews')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async review(@Param('id') id: string, @Body() dto: ReviewDto, @CurrentUser() user: User) {
        return ok(await this.trust.upsertReview(user.id, id, dto.stars, dto.comment, dto.listingId));
    }

    @Post('reviews/:id/reply')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async reply(@Param('id') id: string, @Body() dto: ReplyDto, @CurrentUser() user: User) {
        return ok(await this.trust.replyToReview(id, user.id, dto.reply));
    }

    @Delete('reviews/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteReview(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.deleteReview(id, user.id, user.isAdmin));
    }

    // ---------- Narx taklifi ----------

    @Post('listings/:id/offers')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Narx taklif qilish (savdolashish)' })
    async offer(@Param('id') id: string, @Body() dto: OfferDto, @CurrentUser() user: User) {
        return ok(await this.trust.createOffer(user.id, id, dto.amount, dto.message), 'Taklif yuborildi');
    }

    @Get('listings/:id/offers/mine')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async myOffer(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.getMyOfferForListing(user.id, id));
    }

    @Get('listings/:id/offers')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async listingOffers(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.getListingOffers(id, user.id, user.isAdmin));
    }

    @Get('my/offers')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async myOffers(@Query('direction') direction: string, @CurrentUser() user: User) {
        return ok(await this.trust.getMyOffers(user.id, direction === 'sent' ? 'sent' : 'received'));
    }

    @Post('offers/:id/accept')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async accept(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.resolveOffer(id, user.id, user.isAdmin, true));
    }

    @Post('offers/:id/reject')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async reject(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.resolveOffer(id, user.id, user.isAdmin, false));
    }

    @Post('offers/:id/cancel')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async cancel(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.trust.cancelOffer(id, user.id));
    }

    // ---------- Narx tarixi ----------

    @Get('listings/:id/price-history')
    async priceHistory(@Param('id') id: string) {
        return ok(await this.trust.getPriceHistory(id));
    }

    @Patch('my/listings/:id/price')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Faol e'lon narxini moderatsiyasiz o'zgartirish" })
    async changePrice(@Param('id') id: string, @Body() dto: PriceDto, @CurrentUser() user: User) {
        return ok(await this.trust.changePrice(user.id, id, dto.priceAmount, user.isAdmin), "Narx o'zgartirildi");
    }
}
