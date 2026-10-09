import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactType, Currency, User } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { anonViewerKey, optionalUserId } from '../common/viewer.util';
import { InsightsService } from './insights.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

@ApiTags('Insights')
@Controller()
export class InsightsController {
    constructor(private readonly insights: InsightsService) { }

    @Get('insights/price')
    @ApiOperation({ summary: 'Bozor narxi: zot/yosh bo\'yicha narx oralig\'i' })
    async price(
        @Query('breedId') breedId?: string,
        @Query('ageYears') ageYears?: string,
        @Query('currency') currency?: string,
        @Query('excludeId') excludeId?: string,
    ) {
        const age = ageYears !== undefined && ageYears !== '' ? Number(ageYears) : undefined;
        return ok(
            await this.insights.priceInsight({
                breedId,
                ageYears: Number.isFinite(age) ? age : undefined,
                currency: currency === 'USD' ? Currency.USD : Currency.UZS,
                excludeId,
            }),
        );
    }

    @Post('listings/:id/contact')
    @ApiOperation({ summary: "Qo'ng'iroq / Telegram / chat bosilishini qayd etish" })
    async contact(@Param('id') id: string, @Body() body: { type?: string }, @Req() req: Request) {
        const type = body?.type as ContactType;
        if (!Object.values(ContactType).includes(type)) throw new BadRequestException('type');
        const userId = optionalUserId(req);
        this.insights.trackContact(id, type, userId ?? anonViewerKey(req), userId).catch(() => { });
        return ok(null);
    }

    @Get('my/listings/:id/stats')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async stats(@Param('id') id: string, @CurrentUser() user: User) {
        return ok(await this.insights.listingStats(id, user.id, user.isAdmin));
    }
}
