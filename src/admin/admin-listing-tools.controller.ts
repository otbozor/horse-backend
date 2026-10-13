import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { ListingStatus, User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { HandoverService } from '../handover/handover.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { AdminService } from './admin.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });
const DAY = 24 * 3_600_000;

class ExtendDto {
    @IsInt() @IsIn([7, 30, 60, 90])
    days: number;
}

class TransferDto {
    @IsString() @MinLength(2) @MaxLength(80)
    name: string;

    @IsString() @MinLength(9) @MaxLength(20)
    phone: string;
}

/** Admin: boshqalarning e'lonlari — egasi, qayta faollashtirish, muddatni uzaytirish, boshqa sotuvchiga o'tkazish */
@ApiTags('Admin Listings')
@Controller('admin/listings')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminListingToolsController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly admin: AdminService,
        private readonly handover: HandoverService,
        private readonly channel: TelegramChannelService,
    ) { }

    private async listing(id: string) {
        const l = await this.prisma.horseListing.findUnique({ where: { id }, select: { id: true, status: true, expiresAt: true, publishedAt: true, userId: true } });
        if (!l) throw new NotFoundException("E'lon topilmadi");
        return l;
    }

    /** E'lon egasi: ism, telefon, Telegram, nechta e'loni bor */
    @Get(':id/owner')
    async owner(@Param('id') id: string) {
        const l = await this.listing(id);
        const u = await this.prisma.user.findUnique({
            where: { id: l.userId },
            select: { id: true, displayName: true, phone: true, telegramUsername: true, telegramUserId: true, isAdmin: true, createdAt: true, _count: { select: { listings: true } } },
        });
        if (!u) throw new NotFoundException('Egasi topilmadi');
        return ok({
            id: u.id,
            displayName: u.displayName,
            phone: u.phone,
            // "user_123" — haqiqiy username emas
            telegramUsername: u.telegramUsername && !u.telegramUsername.startsWith('user_') ? u.telegramUsername : null,
            telegramLinked: Boolean(u.telegramUserId),
            isAdmin: u.isAdmin,
            listingsCount: u._count.listings,
            createdAt: u.createdAt,
        });
    }

    /** Arxivlangan / muddati tugagan / rad etilgan e'lonni yana bozorga qaytarish (muddat tugagan bo'lsa +30 kun) */
    @Post(':id/restore')
    async restore(@CurrentUser() me: User, @Param('id') id: string) {
        const l = await this.listing(id);
        if (l.status === ListingStatus.APPROVED) throw new BadRequestException("E'lon allaqachon faol");
        const now = new Date();
        const expiresAt = l.expiresAt && l.expiresAt > now ? l.expiresAt : new Date(now.getTime() + 30 * DAY);
        await this.prisma.horseListing.update({
            where: { id },
            data: { status: ListingStatus.APPROVED, expiresAt, publishedAt: l.publishedAt ?? now, saleSource: null, isPaid: true },
        });
        await this.admin.createAuditLog(me.id, 'listing.restore', 'HorseListing', id);
        this.channel.refreshListingPost(id, 'active').catch(() => undefined);
        return ok({ status: ListingStatus.APPROVED, expiresAt });
    }

    /** Muddatni uzaytirish: hozirgi muddatdan (yoki bugundan) + N kun; tugagan bo'lsa qayta faol */
    @Post(':id/extend')
    async extend(@CurrentUser() me: User, @Param('id') id: string, @Body() body: ExtendDto) {
        const l = await this.listing(id);
        if (l.status !== ListingStatus.APPROVED && l.status !== ListingStatus.EXPIRED) {
            throw new BadRequestException("Faqat faol yoki muddati tugagan e'lonni uzaytirish mumkin");
        }
        const now = new Date();
        const base = l.expiresAt && l.expiresAt > now ? l.expiresAt : now;
        const expiresAt = new Date(base.getTime() + body.days * DAY);
        await this.prisma.horseListing.update({
            where: { id },
            data: { expiresAt, status: ListingStatus.APPROVED, publishedAt: l.publishedAt ?? now },
        });
        await this.admin.createAuditLog(me.id, 'listing.extend', 'HorseListing', id, { days: body.days });
        if (l.status === ListingStatus.EXPIRED) this.channel.refreshListingPost(id, 'active').catch(() => undefined);
        return ok({ expiresAt });
    }

    /** Boshqa sotuvchiga o'tkazish (xato biriktirilgan bo'lsa): telefon bo'yicha topiladi yoki yangi akkaunt */
    @Post(':id/transfer')
    async transfer(@CurrentUser() me: User, @Param('id') id: string, @Body() body: TransferDto) {
        const l = await this.listing(id);
        const seller = await this.handover.findOrCreateSeller(body.name, body.phone);
        if (seller.id === l.userId) throw new BadRequestException("E'lon allaqachon shu sotuvchida");
        await this.prisma.horseListing.update({
            where: { id },
            data: { userId: seller.id, contactName: body.name.trim(), contactPhone: seller.phone, contactTelegram: null },
        });
        await this.admin.createAuditLog(me.id, 'listing.transfer', 'HorseListing', id, { from: l.userId, to: seller.id });
        return ok(await this.handover.info(id));
    }
}
