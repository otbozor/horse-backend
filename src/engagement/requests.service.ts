import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HorseGender, HorsePurpose, HorseRequestStatus, ListingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { formatMoney } from '../trust/price-offer-core';

export interface RequestInput {
    title: string;
    description?: string;
    purpose?: HorsePurpose;
    gender?: HorseGender;
    breedId?: string;
    ageMin?: number;
    ageMax?: number;
    budgetMax?: number;
    regionId?: string;
    contactPhone?: string;
    contactTelegram?: string;
}

const REQUEST_TTL_DAYS = 30;
const MAX_ACTIVE_PER_USER = 5;

const include = {
    breed: { select: { name: true } },
    region: { select: { nameUz: true } },
    user: { select: { id: true, displayName: true, avatarUrl: true, isVerified: true } },
    _count: { select: { responses: true } },
};

@Injectable()
export class RequestsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifier: TelegramChannelService,
        private readonly notifications: NotificationsService,
    ) { }

    private serialize<T extends { budgetMax?: Prisma.Decimal | null }>(r: T) {
        return { ...r, budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null };
    }

    private data(dto: RequestInput) {
        if (!dto.title || dto.title.trim().length < 5) throw new BadRequestException("Sarlavha kamida 5 ta belgi bo'lsin");
        if (!dto.contactPhone?.trim() && !dto.contactTelegram?.trim()) throw new BadRequestException('Telefon yoki Telegram kiriting');
        const ageMin = dto.ageMin != null ? Math.max(0, Math.round(dto.ageMin)) : null;
        const ageMax = dto.ageMax != null ? Math.max(0, Math.round(dto.ageMax)) : null;
        if (ageMin != null && ageMax != null && ageMin > ageMax) throw new BadRequestException("Yosh oralig'i noto'g'ri");
        return {
            title: dto.title.trim().slice(0, 120),
            description: dto.description?.trim().slice(0, 2000) || null,
            purpose: dto.purpose ?? null,
            gender: dto.gender ?? null,
            breedId: dto.breedId || null,
            ageMin,
            ageMax,
            budgetMax: dto.budgetMax && dto.budgetMax > 0 ? dto.budgetMax : null,
            regionId: dto.regionId || null,
            contactPhone: dto.contactPhone?.trim() || null,
            contactTelegram: dto.contactTelegram?.trim().replace(/^@/, '') || null,
        };
    }

    async list(params: { purpose?: string; regionId?: string; q?: string; page?: number }) {
        const where: Prisma.HorseRequestWhereInput = { status: HorseRequestStatus.ACTIVE, expiresAt: { gt: new Date() } };
        if (params.purpose && params.purpose in HorsePurpose) where.purpose = params.purpose as HorsePurpose;
        if (params.regionId) where.regionId = params.regionId;
        if (params.q?.trim()) {
            where.OR = [
                { title: { contains: params.q.trim(), mode: 'insensitive' } },
                { description: { contains: params.q.trim(), mode: 'insensitive' } },
            ];
        }
        const page = Math.max(1, Number(params.page) || 1);
        const limit = 20;
        const [rows, total] = await Promise.all([
            this.prisma.horseRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include }),
            this.prisma.horseRequest.count({ where }),
        ]);
        return { data: rows.map((r) => this.serialize(r)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string, viewerId?: string) {
        const r = await this.prisma.horseRequest.findUnique({ where: { id }, include });
        if (!r || r.status === HorseRequestStatus.REMOVED) throw new NotFoundException("So'rov topilmadi");
        const isOwner = viewerId === r.userId;
        if (!isOwner) {
            this.prisma.horseRequest.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => { });
        }
        const responses = isOwner
            ? await this.prisma.requestResponse.findMany({
                where: { requestId: id },
                orderBy: { createdAt: 'desc' },
                include: {
                    responder: { select: { id: true, displayName: true, avatarUrl: true, telegramUsername: true, phone: true } },
                    listing: {
                        select: {
                            id: true, title: true, priceAmount: true, priceCurrency: true, status: true,
                            media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumbUrl: true } },
                        },
                    },
                },
            })
            : [];
        const myResponses = viewerId && !isOwner
            ? await this.prisma.requestResponse.count({ where: { requestId: id, responderId: viewerId } })
            : 0;
        return { ...this.serialize(r), responses, myResponses };
    }

    async mine(userId: string) {
        const rows = await this.prisma.horseRequest.findMany({
            where: { userId, status: { not: HorseRequestStatus.REMOVED } },
            orderBy: { createdAt: 'desc' },
            include,
        });
        return rows.map((r) => this.serialize(r));
    }

    async create(userId: string, dto: RequestInput) {
        const active = await this.prisma.horseRequest.count({
            where: { userId, status: HorseRequestStatus.ACTIVE, expiresAt: { gt: new Date() } },
        });
        if (active >= MAX_ACTIVE_PER_USER) throw new BadRequestException(`Ko'pi bilan ${MAX_ACTIVE_PER_USER} ta faol so'rov bo'lishi mumkin`);
        const r = await this.prisma.horseRequest.create({
            data: { ...this.data(dto), userId, expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86400000) },
        });
        return this.serialize(r);
    }

    async update(userId: string, id: string, dto: RequestInput) {
        const r = await this.prisma.horseRequest.findUnique({ where: { id } });
        if (!r || r.userId !== userId) throw new NotFoundException("So'rov topilmadi");
        return this.serialize(await this.prisma.horseRequest.update({ where: { id }, data: this.data(dto) }));
    }

    /** Yopish (ot topildi) yoki qayta faollashtirish - muddati yana 30 kunga uzayadi */
    async setStatus(userId: string, id: string, active: boolean) {
        const r = await this.prisma.horseRequest.findUnique({ where: { id } });
        if (!r || r.userId !== userId) throw new NotFoundException("So'rov topilmadi");
        return this.serialize(
            await this.prisma.horseRequest.update({
                where: { id },
                data: active
                    ? { status: HorseRequestStatus.ACTIVE, expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86400000) }
                    : { status: HorseRequestStatus.CLOSED },
            }),
        );
    }

    async respond(responderId: string, requestId: string, listingId?: string, message?: string) {
        const r = await this.prisma.horseRequest.findUnique({
            where: { id: requestId },
            include: { user: { select: { telegramUserId: true } } },
        });
        if (!r || r.status !== HorseRequestStatus.ACTIVE || r.expiresAt < new Date()) throw new NotFoundException("So'rov faol emas");
        if (r.userId === responderId) throw new ForbiddenException("O'z so'rovingizga javob bera olmaysiz");
        const text = message?.trim().slice(0, 500) || null;
        if (!listingId && !text) throw new BadRequestException("E'lon tanlang yoki xabar yozing");

        let listing: { id: string; title: string; priceAmount: Prisma.Decimal; priceCurrency: string } | null = null;
        if (listingId) {
            listing = await this.prisma.horseListing.findFirst({
                where: { id: listingId, userId: responderId, status: ListingStatus.APPROVED },
                select: { id: true, title: true, priceAmount: true, priceCurrency: true },
            });
            if (!listing) throw new BadRequestException("Faqat o'zingizning faol e'loningizni taklif qila olasiz");
        }
        const duplicate = await this.prisma.requestResponse.findFirst({
            where: { requestId, responderId, listingId: listingId ?? null },
        });
        if (duplicate) throw new BadRequestException('Bu taklifni allaqachon yuborgansiz');
        const total = await this.prisma.requestResponse.count({ where: { requestId, responderId } });
        if (total >= 3) throw new BadRequestException("Bitta so'rovga ko'pi bilan 3 ta javob");

        const response = await this.prisma.requestResponse.create({
            data: { requestId, responderId, listingId: listing?.id ?? null, message: text },
        });

        if (r.user.telegramUserId) {
            const responder = await this.prisma.user.findUnique({
                where: { id: responderId },
                select: { displayName: true, phone: true, telegramUsername: true },
            });
            const tg = responder?.telegramUsername && !responder.telegramUsername.startsWith('user_') ? responder.telegramUsername : null;
            this.notifier
                .notifyRequestResponse(
                    r.user.telegramUserId.toString(),
                    { id: r.id, title: r.title },
                    { name: responder?.displayName ?? 'Sotuvchi', phone: responder?.phone, telegram: tg },
                    listing ? { id: listing.id, title: listing.title, price: formatMoney(listing.priceAmount, listing.priceCurrency) } : null,
                    text,
                )
                .catch(() => { });
        }
        void this.notifications.deliver({
            userId: responderId,
            category: NotificationCategory.OFFERS,
            title: `Javobingiz yuborildi: ${r.title}`,
            html: `📤 <b>Javobingiz xaridorga yuborildi</b>\n\n🔎 ${r.title.replace(/</g, '&lt;')}\n\nXaridor sizga o'zi bog'lanadi.`,
            link: `/requests/${r.id}`,
        });
        return response;
    }

    // ---------- Admin ----------

    async adminList() {
        const rows = await this.prisma.horseRequest.findMany({
            where: { status: HorseRequestStatus.ACTIVE },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include,
        });
        return rows.map((r) => this.serialize(r));
    }

    async adminRemove(id: string) {
        await this.prisma.horseRequest.update({ where: { id }, data: { status: HorseRequestStatus.REMOVED } });
        return { success: true };
    }
}
