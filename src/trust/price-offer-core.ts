import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PriceOfferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';

export function formatMoney(amount: { toString(): string } | number, currency: string): string {
    const n = Math.round(Number(amount.toString()));
    const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return currency === 'USD' ? `$${s}` : `${s} so'm`;
}

/**
 * Narx taklifini qabul qilish / rad etish. Mini App (TrustService) va bot
 * tugmasi (TelegramBotService) ikkalasi ham shu funksiyadan foydalanadi -
 * modullar orasida aylanma bog'liqlik bo'lmasligi uchun DI'siz yozilgan.
 *
 * actor: Mini App'dan userId, botdan esa telegramUserId bilan aniqlanadi.
 */
export async function resolvePriceOffer(
    prisma: PrismaService,
    notifier: TelegramChannelService,
    offerId: string,
    actor: { userId?: string; telegramUserId?: bigint; isAdmin?: boolean },
    accept: boolean,
) {
    const offer = await prisma.priceOffer.findUnique({
        where: { id: offerId },
        include: {
            buyer: { select: { telegramUserId: true } },
            listing: {
                select: {
                    id: true,
                    title: true,
                    contactName: true,
                    contactPhone: true,
                    contactTelegram: true,
                    user: { select: { id: true, telegramUserId: true, displayName: true, phone: true, telegramUsername: true } },
                },
            },
        },
    });
    if (!offer) throw new NotFoundException('Taklif topilmadi');

    const seller = offer.listing.user;
    const isSeller =
        (actor.userId && actor.userId === seller.id) ||
        (actor.telegramUserId !== undefined && seller.telegramUserId === actor.telegramUserId);
    if (!isSeller && !actor.isAdmin) throw new ForbiddenException("Bu sizning e'loningiz emas");
    if (offer.status !== PriceOfferStatus.PENDING) {
        throw new BadRequestException("Bu taklif allaqachon ko'rib chiqilgan");
    }

    const updated = await prisma.priceOffer.update({
        where: { id: offerId },
        data: { status: accept ? PriceOfferStatus.ACCEPTED : PriceOfferStatus.REJECTED, respondedAt: new Date() },
    });

    if (offer.buyer.telegramUserId) {
        const tg = offer.listing.contactTelegram || seller.telegramUsername;
        notifier
            .notifyPriceOfferResult(
                offer.buyer.telegramUserId.toString(),
                accept,
                { id: offer.listing.id, title: offer.listing.title },
                formatMoney(offer.amount, offer.currency),
                {
                    name: offer.listing.contactName || seller.displayName,
                    phone: offer.listing.contactPhone || seller.phone,
                    telegram: tg && !tg.startsWith('user_') ? tg : null,
                },
            )
            .catch(() => { });
    }

    return { ...updated, amount: Number(updated.amount) };
}
