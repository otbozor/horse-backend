import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AuctionStatus, ListingStatus, NotificationCategory, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatMoney } from '../trust/price-offer-core';

const MINUTE = 60000;
const ANTI_SNIPE_MS = 5 * MINUTE; // oxirgi 5 daqiqadagi taklif muddatni 5 daqiqaga uzaytiradi
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "Ali Valiyev" -> "Ali V." — boshqalar ro'yxatida to'liq ism ko'rinmaydi */
function maskName(name: string | null | undefined): string {
    const parts = (name || 'Ishtirokchi').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

const AUCTION_INCLUDE = {
    bids: { orderBy: { createdAt: 'desc' as const }, take: 10, include: { user: { select: { id: true, displayName: true } } } },
    _count: { select: { bids: true } },
} satisfies Prisma.AuctionInclude;

export interface CreateAuctionInput {
    startPrice: number;
    minStep?: number;
    durationDays: number;
}

/** Kim oshdi savdosi: sotuvchi faol e'lonni auksionga qo'yadi, xaridorlar taklif beradi */
@Injectable()
export class AuctionsService {
    private readonly logger = new Logger(AuctionsService.name);
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
        private readonly notifications: NotificationsService,
        private readonly channel: TelegramChannelService,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    private serialize(a: Prisma.AuctionGetPayload<{ include: typeof AUCTION_INCLUDE }>, viewerId?: string) {
        const current = a.currentPrice ? Number(a.currentPrice) : null;
        const minStep = Number(a.minStep);
        return {
            id: a.id,
            listingId: a.listingId,
            status: a.status,
            currency: a.currency,
            startPrice: Number(a.startPrice),
            minStep,
            currentPrice: current,
            nextMinBid: current != null ? current + minStep : Number(a.startPrice),
            endsAt: a.endsAt,
            bidCount: a._count.bids,
            cancelRequestReason: viewerId && a.sellerId === viewerId ? a.cancelRequestReason : null,
            cancelRequested: Boolean(a.cancelRequestedAt),
            cancelReason: a.status === AuctionStatus.CANCELLED ? a.cancelReason : null,
            isLeader: Boolean(viewerId && a.leaderId === viewerId),
            isSeller: Boolean(viewerId && a.sellerId === viewerId),
            bids: a.bids.map((b) => ({
                amount: Number(b.amount),
                createdAt: b.createdAt,
                name: b.user.id === viewerId ? 'Siz' : maskName(b.user.displayName),
                mine: b.user.id === viewerId,
            })),
        };
    }

    private async notify(chatId: bigint | null | undefined, text: string, listingId: string) {
        if (!chatId) return;
        const plain = (l: string) => l.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
        const [first, second] = text.split('\n');
        await this.notifications.deliver({
            telegramUserId: chatId,
            category: NotificationCategory.AUCTIONS,
            title: [plain(first), second ? plain(second).replace(/^🐴\s*/, '') : ''].filter(Boolean).join(' · ').slice(0, 120),
            html: text,
            link: `/listings/${listingId}`,
            buttonText: '📱 Auksionni ochish',
        });
    }

    // =================== Ko'rish ===================

    async forListing(listingId: string, viewerId?: string) {
        const a = await this.prisma.auction.findFirst({
            where: { listingId, status: { in: [AuctionStatus.ACTIVE, AuctionStatus.ENDED] } },
            orderBy: { createdAt: 'desc' },
            include: AUCTION_INCLUDE,
        });
        return a ? this.serialize(a, viewerId) : null;
    }

    async listActive() {
        const rows = await this.prisma.auction.findMany({
            where: { status: AuctionStatus.ACTIVE, endsAt: { gt: new Date() }, listing: { status: ListingStatus.APPROVED } },
            orderBy: { endsAt: 'asc' },
            take: 20,
            include: {
                ...AUCTION_INCLUDE,
                listing: {
                    select: {
                        id: true, title: true, slug: true, priceAmount: true, priceCurrency: true, ageYears: true,
                        region: { select: { nameUz: true } },
                        media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumbUrl: true, type: true } },
                    },
                },
            },
        });
        return rows.map((r) => ({ ...this.serialize(r), listing: r.listing }));
    }

    // =================== Sotuvchi ===================

    async create(listingId: string, sellerId: string, dto: CreateAuctionInput) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId !== sellerId) throw new ForbiddenException("Bu sizning e'loningiz emas");
        if (listing.status !== ListingStatus.APPROVED) throw new BadRequestException("Faqat faol e'lonni auksionga qo'yish mumkin");
        const active = await this.prisma.auction.findFirst({ where: { listingId, status: AuctionStatus.ACTIVE } });
        if (active) throw new BadRequestException('Bu e\'lon allaqachon auksionda');

        const startPrice = Math.round(Number(dto.startPrice));
        if (!(startPrice > 0)) throw new BadRequestException("Boshlang'ich narxni kiriting");
        const listingPrice = Number(listing.priceAmount);
        if (listingPrice > 0 && startPrice > listingPrice) {
            throw new BadRequestException(`Boshlang'ich narx e'lon narxidan (${formatMoney(listingPrice, listing.priceCurrency)}) oshmasligi kerak`);
        }
        const days = Math.round(Number(dto.durationDays));
        if (![1, 3, 5, 7].includes(days)) throw new BadRequestException("Muddat 1, 3, 5 yoki 7 kun bo'lishi mumkin");
        const autoStep = Math.max(1, Math.round(startPrice * 0.02 / 1000) * 1000) || 1;
        const minStep = dto.minStep && dto.minStep > 0 ? Math.round(dto.minStep) : autoStep;

        const a = await this.prisma.auction.create({
            data: {
                listingId,
                sellerId,
                currency: listing.priceCurrency,
                startPrice,
                minStep,
                endsAt: new Date(Date.now() + days * 86400000),
            },
            include: AUCTION_INCLUDE,
        });
        const seller = await this.prisma.user.findUnique({ where: { id: sellerId }, select: { telegramUserId: true } });
        void this.notify(
            seller?.telegramUserId,
            `🔨 <b>Auksion boshlandi</b>\n🐴 ${esc(listing.title)}\nBoshlang'ich narx: <b>${formatMoney(startPrice, listing.priceCurrency)}</b>\nTugaydi: ${a.endsAt.toISOString().slice(0, 16).replace('T', ' ')} (UTC)\n\nHar bir yangi taklif haqida xabar beramiz.`,
            listing.id,
        );
        // Kanalga e'lon (kanal yoqilgan bo'lsa)
        const forChannel = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            select: {
                id: true, title: true, ageYears: true,
                region: { select: { nameUz: true } }, breed: { select: { name: true } },
                media: { where: { type: 'IMAGE' }, orderBy: { sortOrder: 'asc' }, select: { url: true } },
            },
        });
        if (forChannel) {
            this.channel
                .postAuctionToChannel(forChannel, { id: a.id, startPrice, minStep, currency: listing.priceCurrency, endsAt: a.endsAt })
                .catch(() => { });
        }
        return this.serialize(a, sellerId);
    }

    /** Taklif bo'lmasa sotuvchi (yoki admin) bekor qila oladi */
    async cancel(auctionId: string, actorId: string, isAdmin: boolean) {
        const a = await this.prisma.auction.findUnique({ where: { id: auctionId }, include: { _count: { select: { bids: true } } } });
        if (!a) throw new NotFoundException('Auksion topilmadi');
        if (a.sellerId !== actorId && !isAdmin) throw new ForbiddenException();
        if (a.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auksion faol emas');
        if (a._count.bids > 0 && !isAdmin) {
            throw new BadRequestException("Taklif tushgan auksionni faqat admin bekor qiladi — «Bekor qilishni so'rash» tugmasidan foydalaning");
        }
        return this.adminCancel(auctionId, isAdmin && a.sellerId !== actorId ? 'Admin tomonidan bekor qilindi' : "Sotuvchi bekor qildi");
    }

    /** Sotuvchi: taklif tushgandan keyin bekor qilishni sabab bilan so'raydi */
    async requestCancel(auctionId: string, sellerId: string, reason: string) {
        const text = reason?.trim().slice(0, 500);
        if (!text || text.length < 5) throw new BadRequestException('Sababini batafsilroq yozing');
        const a = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { id: true, title: true } }, seller: { select: { displayName: true, telegramUserId: true } } },
        });
        if (!a) throw new NotFoundException('Auksion topilmadi');
        if (a.sellerId !== sellerId) throw new ForbiddenException();
        if (a.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auksion faol emas');
        if (a.cancelRequestedAt) throw new BadRequestException("So'rov allaqachon yuborilgan — admin javobini kuting");
        await this.prisma.auction.update({ where: { id: auctionId }, data: { cancelRequestReason: text, cancelRequestedAt: new Date() } });
        void this.notify(
            a.seller.telegramUserId,
            `📨 <b>Bekor qilish so'rovingiz yuborildi</b>\n🐴 ${esc(a.listing.title)}\n📝 ${esc(text)}\n\nAdmin ko'rib chiqqach javob beramiz. Shu vaqtgacha auksion davom etadi.`,
            a.listing.id,
        );
        this.channel
            .notifyAdmins(
                `🛑 <b>Auksionni bekor qilish so'rovi</b>\n\n🐴 ${esc(a.listing.title)}\n👤 ${esc(a.seller.displayName)}\n📝 ${esc(text)}`,
                '/admin',
                "📱 Admin panelda ko'rish",
            )
            .catch(() => { });
        return { success: true };
    }

    /** Admin: auksionni bekor qiladi — sotuvchi va barcha ishtirokchilar xabardor bo'ladi */
    async adminCancel(auctionId: string, reason?: string) {
        const a = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: { select: { id: true, title: true } },
                seller: { select: { telegramUserId: true } },
                bids: { select: { userId: true }, distinct: ['userId'] },
            },
        });
        if (!a) throw new NotFoundException('Auksion topilmadi');
        if (a.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auksion faol emas');
        const why = reason?.trim().slice(0, 500) || a.cancelRequestReason || null;
        await this.prisma.auction.update({ where: { id: auctionId }, data: { status: AuctionStatus.CANCELLED, cancelReason: why } });
        this.channel.refreshAuctionPost(auctionId).catch(() => { });
        const title = esc(a.listing.title);
        void this.notify(a.seller.telegramUserId, `🛑 <b>Auksion bekor qilindi</b>\n🐴 ${title}${why ? `\n📝 ${esc(why)}` : ''}`, a.listing.id);
        if (a.bids.length) {
            const users = await this.prisma.user.findMany({ where: { id: { in: a.bids.map((b) => b.userId) } }, select: { telegramUserId: true } });
            for (const u of users) {
                void this.notify(u.telegramUserId, `🛑 <b>Auksion bekor qilindi</b>\n🐴 ${title}${why ? `\n📝 Sabab: ${esc(why)}` : ''}\n\nTaklifingiz kuchini yo'qotdi.`, a.listing.id);
            }
        }
        return { success: true };
    }

    /** Admin: bekor qilish so'rovini rad etadi — auksion davom etadi */
    async rejectCancelRequest(auctionId: string, note?: string) {
        const a = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { id: true, title: true } }, seller: { select: { telegramUserId: true } } },
        });
        if (!a || !a.cancelRequestedAt) throw new NotFoundException("So'rov topilmadi");
        await this.prisma.auction.update({ where: { id: auctionId }, data: { cancelRequestReason: null, cancelRequestedAt: null } });
        void this.notify(
            a.seller.telegramUserId,
            `↩️ <b>Bekor qilish so'rovingiz rad etildi</b>\n🐴 ${esc(a.listing.title)}${note?.trim() ? `\n📝 ${esc(note.trim())}` : ''}\n\nAuksion davom etadi.`,
            a.listing.id,
        );
        return { success: true };
    }

    /** Admin paneli: faol auksionlar (avval bekor qilish so'rovi borlari) */
    async adminList() {
        const rows = await this.prisma.auction.findMany({
            where: { status: AuctionStatus.ACTIVE },
            orderBy: [{ cancelRequestedAt: { sort: 'desc', nulls: 'last' } }, { endsAt: 'asc' }],
            take: 100,
            include: {
                listing: { select: { id: true, title: true } },
                seller: { select: { displayName: true } },
                _count: { select: { bids: true } },
            },
        });
        return rows.map((a) => ({
            id: a.id,
            listing: a.listing,
            sellerName: a.seller.displayName,
            currency: a.currency,
            startPrice: Number(a.startPrice),
            currentPrice: a.currentPrice ? Number(a.currentPrice) : null,
            bidCount: a._count.bids,
            endsAt: a.endsAt,
            cancelRequestReason: a.cancelRequestReason,
            cancelRequestedAt: a.cancelRequestedAt,
        }));
    }

    // =================== Xaridor ===================

    private bidTx(auctionId: string, userId: string, amount: number) {
        return this.prisma.$transaction(
            async (tx) => {
                const a = await tx.auction.findUnique({
                    where: { id: auctionId },
                    include: { listing: { select: { id: true, title: true, status: true } } },
                });
                if (!a || a.status !== AuctionStatus.ACTIVE || a.endsAt <= new Date()) throw new BadRequestException('Auksion yakunlangan');
                if (a.listing.status !== ListingStatus.APPROVED) throw new BadRequestException("E'lon faol emas");
                if (a.sellerId === userId) throw new BadRequestException("O'z auksioningizga taklif bera olmaysiz");
                if (a.leaderId === userId) throw new BadRequestException('Eng yuqori taklif allaqachon sizniki');
                const min = a.currentPrice ? Number(a.currentPrice) + Number(a.minStep) : Number(a.startPrice);
                if (!(amount >= min)) throw new BadRequestException(`Taklif kamida ${formatMoney(min, a.currency)} bo'lishi kerak`);
                if (amount > min * 5) throw new BadRequestException("Taklif juda katta — summani tekshiring");

                const extend = a.endsAt.getTime() - Date.now() < ANTI_SNIPE_MS;
                await tx.bid.create({ data: { auctionId, userId, amount } });
                // Optimistik qulf: boshqa taklif oraliqda tushgan bo'lsa, yangilanish bo'lmaydi
                const upd = await tx.auction.updateMany({
                    where: { id: auctionId, leaderId: a.leaderId, currentPrice: a.currentPrice },
                    data: {
                        currentPrice: amount,
                        leaderId: userId,
                        ...(extend ? { endsAt: new Date(Date.now() + ANTI_SNIPE_MS) } : {}),
                    },
                });
                if (upd.count !== 1) throw new BadRequestException("Shu payt boshqa taklif tushdi — qaytadan urinib ko'ring");
                return { prevLeaderId: a.leaderId, sellerId: a.sellerId, listing: a.listing, currency: a.currency, extended: extend };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }

    async bid(auctionId: string, userId: string, amountRaw: number) {
        const amount = Math.round(Number(amountRaw));
        let result: Awaited<ReturnType<typeof this.bidTx>>;
        try {
            result = await this.bidTx(auctionId, userId, amount);
        } catch (e) {
            // Bir vaqtda tushgan takliflar: Postgres serializatsiya xatosi
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
                throw new BadRequestException("Shu payt boshqa taklif tushdi — qaytadan urinib ko'ring");
            }
            throw e;
        }


        // Bildirishnomalar (tranzaksiyadan tashqarida)
        const [prev, seller] = await Promise.all([
            result.prevLeaderId ? this.prisma.user.findUnique({ where: { id: result.prevLeaderId }, select: { telegramUserId: true } }) : null,
            this.prisma.user.findUnique({ where: { id: result.sellerId }, select: { telegramUserId: true } }),
        ]);
        const price = formatMoney(amount, result.currency);
        void this.notify(prev?.telegramUserId, `⚠️ <b>Taklifingiz oshib ketildi</b>\n🐴 ${esc(result.listing.title)}\nYangi narx: <b>${price}</b>`, result.listing.id);
        void this.notify(seller?.telegramUserId, `🔨 <b>Auksionda yangi taklif</b>\n🐴 ${esc(result.listing.title)}\nJoriy narx: <b>${price}</b>`, result.listing.id);
        this.channel.refreshAuctionPost(auctionId).catch(() => { });
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramUserId: true } });
        void this.notify(
            me?.telegramUserId,
            `✅ <b>Taklifingiz qayd etildi — hozir eng yuqori taklif sizniki</b>\n🐴 ${esc(result.listing.title)}\nSizning taklifingiz: <b>${price}</b>${result.extended ? '\n⏱ Auksion 5 daqiqaga uzaytirildi' : ''}\n\nKimdir oshirsa, darhol xabar beramiz.`,
            result.listing.id,
        );

        const a = await this.prisma.auction.findUnique({ where: { id: auctionId }, include: AUCTION_INCLUDE });
        return this.serialize(a!, userId);
    }

    // =================== Yakunlash ===================

    @Cron(CronExpression.EVERY_MINUTE)
    async endingSoon() {
        const soon = await this.prisma.auction.findMany({
            where: { status: AuctionStatus.ACTIVE, endingSoonNotifiedAt: null, endsAt: { gt: new Date(), lte: new Date(Date.now() + 60 * MINUTE) } },
            include: {
                listing: { select: { id: true, title: true } },
                seller: { select: { telegramUserId: true } },
                bids: { select: { userId: true }, distinct: ['userId'] },
            },
            take: 50,
        });
        for (const a of soon) {
            const claimed = await this.prisma.auction.updateMany({ where: { id: a.id, endingSoonNotifiedAt: null }, data: { endingSoonNotifiedAt: new Date() } });
            if (claimed.count !== 1) continue;
            const price = formatMoney(a.currentPrice ?? a.startPrice, a.currency);
            const text = (who: string) => `⏳ <b>Auksion tugashiga 1 soatdan kam qoldi</b>\n🐴 ${esc(a.listing.title)}\nJoriy narx: <b>${price}</b>${who}`;
            void this.notify(a.seller.telegramUserId, text(''), a.listing.id);
            if (a.bids.length) {
                const users = await this.prisma.user.findMany({ where: { id: { in: a.bids.map((b) => b.userId) } }, select: { id: true, telegramUserId: true } });
                for (const u of users) void this.notify(u.telegramUserId, text(u.id === a.leaderId ? '\n👑 Hozircha siz yetakchisiz' : "\nTaklifingizni oshirishga ulguring!"), a.listing.id);
            }
        }
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async closeExpired() {
        const due = await this.prisma.auction.findMany({
            where: { status: AuctionStatus.ACTIVE, endsAt: { lte: new Date() } },
            include: {
                listing: { select: { id: true, title: true, contactName: true, contactPhone: true, contactTelegram: true } },
                seller: { select: { telegramUserId: true, displayName: true, phone: true, telegramUsername: true } },
                leader: { select: { telegramUserId: true, displayName: true, phone: true, telegramUsername: true } },
                bids: { select: { userId: true }, distinct: ['userId'] },
            },
            take: 50,
        });
        for (const a of due) {
            const claimed = await this.prisma.auction.updateMany({ where: { id: a.id, status: AuctionStatus.ACTIVE }, data: { status: AuctionStatus.ENDED } });
            if (claimed.count !== 1) continue;
            this.channel.refreshAuctionPost(a.id).catch(() => { });
            const title = esc(a.listing.title);
            if (!a.leader || !a.currentPrice) {
                void this.notify(a.seller.telegramUserId, `⏱ <b>Auksion yakunlandi</b>\n🐴 ${title}\nAfsuski, taklif tushmadi.`, a.listing.id);
                continue;
            }
            const price = formatMoney(a.currentPrice, a.currency);
            const sellerPhone = a.listing.contactPhone || a.seller.phone;
            const sellerTg = a.listing.contactTelegram || a.seller.telegramUsername;
            void this.notify(
                a.leader.telegramUserId,
                `🏆 <b>Siz auksionda g'olib bo'ldingiz!</b>\n🐴 ${title}\n💰 ${price}\n\n` +
                `Sotuvchi: ${esc(a.listing.contactName || a.seller.displayName)}` +
                (sellerPhone ? `\n📞 ${esc(sellerPhone)}` : '') + (sellerTg ? `\n✈️ @${esc(sellerTg.replace(/^@/, ''))}` : ''),
                a.listing.id,
            );
            void this.notify(
                a.seller.telegramUserId,
                `🏆 <b>Auksion yakunlandi!</b>\n🐴 ${title}\n💰 Yakuniy narx: <b>${price}</b>\n\n` +
                `G'olib: ${esc(a.leader.displayName)}` +
                (a.leader.phone ? `\n📞 ${esc(a.leader.phone)}` : '') + (a.leader.telegramUsername ? `\n✈️ @${esc(a.leader.telegramUsername)}` : ''),
                a.listing.id,
            );
            const others = a.bids.map((b) => b.userId).filter((id) => id !== a.leaderId);
            if (others.length) {
                const users = await this.prisma.user.findMany({ where: { id: { in: others } }, select: { telegramUserId: true } });
                for (const u of users) void this.notify(u.telegramUserId, `⏱ <b>Auksion yakunlandi</b>\n🐴 ${title}\nYakuniy narx: ${price}. Bu safar boshqa ishtirokchi yutdi.`, a.listing.id);
            }
            this.logger.log(`🔨 Auksion yakunlandi: ${a.id} — ${price}`);
        }
    }
}
