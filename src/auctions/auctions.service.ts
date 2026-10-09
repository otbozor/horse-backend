import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AuctionStatus, ListingStatus, Prisma } from '@prisma/client';
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
        await this.bot.telegram
            .sendMessage(chatId.toString(), text, {
                parse_mode: 'HTML',
                ...(this.miniAppUrl
                    ? { reply_markup: { inline_keyboard: [[{ text: "📱 Auksionni ochish", web_app: { url: `${this.miniAppUrl}/listings/${listingId}` } }]] } }
                    : {}),
            })
            .catch(() => { });
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
        return this.serialize(a, sellerId);
    }

    /** Taklif bo'lmasa sotuvchi (yoki admin) bekor qila oladi */
    async cancel(auctionId: string, actorId: string, isAdmin: boolean) {
        const a = await this.prisma.auction.findUnique({ where: { id: auctionId }, include: { _count: { select: { bids: true } } } });
        if (!a) throw new NotFoundException('Auksion topilmadi');
        if (a.sellerId !== actorId && !isAdmin) throw new ForbiddenException();
        if (a.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auksion faol emas');
        if (a._count.bids > 0 && !isAdmin) throw new BadRequestException("Taklif tushgan auksionni bekor qilib bo'lmaydi");
        await this.prisma.auction.update({ where: { id: auctionId }, data: { status: AuctionStatus.CANCELLED } });
        return { success: true };
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

        const a = await this.prisma.auction.findUnique({ where: { id: auctionId }, include: AUCTION_INCLUDE });
        return this.serialize(a!, userId);
    }

    // =================== Yakunlash ===================

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
