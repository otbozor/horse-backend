import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ViewDedupe } from '../common/viewer.util';
import { Prisma, ServiceCategory, ServiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
    VETERINAR: 'Veterinar',
    TAQACHI: 'Taqachi',
    OT_TASHISH: 'Ot tashish',
    CHAVANDOZ: 'Chavandoz',
    MURABBIY: 'Murabbiy / ot o\'rgatish',
    OT_BOQISH: 'Ot boqish / otxona',
    EGAR_USTASI: 'Egar va jabduq ustasi',
    YEM_YETKAZISH: 'Yem-xashak yetkazish',
    BOSHQA: 'Boshqa xizmat',
};

export interface ServiceInput {
    category: ServiceCategory;
    title: string;
    description?: string;
    regionId?: string;
    districtId?: string;
    priceFrom?: number | null;
    priceNote?: string;
    contactName?: string;
    contactPhone?: string;
    contactTelegram?: string;
    media?: { url: string }[];
}

const listInclude = {
    region: { select: { nameUz: true } },
    district: { select: { nameUz: true } },
    media: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
    user: { select: { id: true, displayName: true, isVerified: true, avatarUrl: true } },
};

@Injectable()
export class ServicesCatalogService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifier: TelegramChannelService,
        private readonly notifications: NotificationsService,
    ) { }

    private serialize<T extends { priceFrom?: Prisma.Decimal | null }>(s: T) {
        return { ...s, priceFrom: s.priceFrom != null ? Number(s.priceFrom) : null };
    }

    private validate(dto: ServiceInput) {
        if (!dto.category || !Object.keys(SERVICE_CATEGORY_LABELS).includes(dto.category)) {
            throw new BadRequestException('Xizmat turini tanlang');
        }
        if (!dto.title || dto.title.trim().length < 3) throw new BadRequestException('Nomi kamida 3 ta belgi bo\'lsin');
        if (!dto.contactPhone?.trim() && !dto.contactTelegram?.trim()) {
            throw new BadRequestException('Telefon yoki Telegram kiriting');
        }
    }

    private data(dto: ServiceInput) {
        return {
            category: dto.category,
            title: dto.title.trim().slice(0, 120),
            description: dto.description?.trim().slice(0, 3000) || null,
            regionId: dto.regionId || null,
            districtId: dto.districtId || null,
            priceFrom: dto.priceFrom && dto.priceFrom > 0 ? dto.priceFrom : null,
            priceNote: dto.priceNote?.trim().slice(0, 60) || null,
            contactName: dto.contactName?.trim() || null,
            contactPhone: dto.contactPhone?.trim() || null,
            contactTelegram: dto.contactTelegram?.trim().replace(/^@/, '') || null,
        };
    }

    // ---------- Ommaviy ----------

    async findAll(params: { category?: string; regionId?: string; q?: string; page?: number; limit?: number }) {
        const where: Prisma.ServiceListingWhereInput = { status: ServiceStatus.APPROVED };
        if (params.category && params.category in SERVICE_CATEGORY_LABELS) where.category = params.category as ServiceCategory;
        if (params.regionId) where.regionId = params.regionId;
        if (params.q?.trim()) {
            where.OR = [
                { title: { contains: params.q.trim(), mode: 'insensitive' } },
                { description: { contains: params.q.trim(), mode: 'insensitive' } },
            ];
        }
        const page = Math.max(1, Number(params.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
        const [rows, total] = await Promise.all([
            this.prisma.serviceListing.findMany({
                where,
                orderBy: { publishedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: listInclude,
            }),
            this.prisma.serviceListing.count({ where }),
        ]);
        return { data: rows.map((r) => this.serialize(r)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async categoryCounts() {
        const rows = await this.prisma.serviceListing.groupBy({
            by: ['category'],
            where: { status: ServiceStatus.APPROVED },
            _count: true,
        });
        return Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({
            value,
            label,
            count: rows.find((r) => r.category === value)?._count ?? 0,
        }));
    }

    async findOne(id: string, viewer?: { id: string; isAdmin: boolean }) {
        const s = await this.prisma.serviceListing.findUnique({
            where: { id },
            include: {
                region: { select: { nameUz: true } },
                district: { select: { nameUz: true } },
                media: { orderBy: { sortOrder: 'asc' } },
                user: { select: { id: true, displayName: true, isVerified: true, avatarUrl: true, telegramUsername: true, createdAt: true } },
            },
        });
        const canSeeHidden = viewer && (viewer.isAdmin || viewer.id === s?.userId);
        if (!s || (s.status !== ServiceStatus.APPROVED && !canSeeHidden)) throw new NotFoundException('Xizmat topilmadi');
        return this.serialize(s);
    }

    private readonly viewDedupe = new ViewDedupe();

    /** Bir ko'ruvchi 24 soatda bir marta sanaladi, egasi sanalmaydi */
    async trackView(id: string, viewerKey: string, userId?: string) {
        if (!this.viewDedupe.hit(`${id}:${viewerKey}`)) return;
        await this.prisma.serviceListing.updateMany({
            where: { id, status: ServiceStatus.APPROVED, ...(userId ? { NOT: { userId } } : {}) },
            data: { viewCount: { increment: 1 } },
        });
    }

    // ---------- Foydalanuvchi ----------

    async findMine(userId: string) {
        const rows = await this.prisma.serviceListing.findMany({
            where: { userId, status: { not: ServiceStatus.ARCHIVED } },
            orderBy: { updatedAt: 'desc' },
            include: listInclude,
        });
        return rows.map((r) => this.serialize(r));
    }

    async create(userId: string, dto: ServiceInput) {
        this.validate(dto);
        const created = await this.prisma.serviceListing.create({
            data: {
                ...this.data(dto),
                userId,
                media: { create: (dto.media ?? []).slice(0, 10).map((m, i) => ({ url: m.url, sortOrder: i })) },
            },
        });
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        this.notifier
            .notifyAdminNewService({ id: created.id, title: created.title, category: SERVICE_CATEGORY_LABELS[created.category], userName: user?.displayName })
            .catch(() => { });
        void this.notifications.deliver({
            userId,
            category: NotificationCategory.LISTINGS,
            title: `Xizmatingiz tekshiruvga yuborildi: ${created.title}`,
            html: `⏳ <b>Xizmatingiz tekshiruvga yuborildi</b>\n\n🛠 ${created.title.replace(/</g, '&lt;')}\n\nModerator tasdiqlagach katalogda ko'rinadi.`,
            link: '/my-listings',
        });
        return this.serialize(created);
    }

    async update(userId: string, id: string, dto: ServiceInput, isAdmin: boolean) {
        const existing = await this.prisma.serviceListing.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Xizmat topilmadi');
        if (existing.userId !== userId && !isAdmin) throw new ForbiddenException('Bu sizning xizmatingiz emas');
        this.validate(dto);
        const updated = await this.prisma.$transaction(async (tx) => {
            if (dto.media) {
                await tx.serviceMedia.deleteMany({ where: { serviceId: id } });
                await tx.serviceMedia.createMany({ data: dto.media.slice(0, 10).map((m, i) => ({ serviceId: id, url: m.url, sortOrder: i })) });
            }
            return tx.serviceListing.update({
                where: { id },
                // Egasi tahrirlasa qayta moderatsiyaga tushadi
                data: { ...this.data(dto), ...(isAdmin ? {} : { status: ServiceStatus.PENDING, rejectReason: null }) },
            });
        });
        return this.serialize(updated);
    }

    async archive(userId: string, id: string, isAdmin: boolean) {
        const existing = await this.prisma.serviceListing.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Xizmat topilmadi');
        if (existing.userId !== userId && !isAdmin) throw new ForbiddenException('Bu sizning xizmatingiz emas');
        await this.prisma.serviceListing.update({ where: { id }, data: { status: ServiceStatus.ARCHIVED } });
        return { success: true };
    }

    // ---------- Admin ----------

    async adminList(status: ServiceStatus = ServiceStatus.PENDING) {
        const rows = await this.prisma.serviceListing.findMany({
            where: { status },
            orderBy: { createdAt: status === ServiceStatus.PENDING ? 'asc' : 'desc' },
            take: 100,
            include: {
                ...listInclude,
                media: { orderBy: { sortOrder: 'asc' } },
                user: { select: { id: true, displayName: true, telegramUsername: true, isVerified: true, avatarUrl: true } },
            },
        });
        return rows.map((r) => this.serialize(r));
    }

    async approve(id: string) {
        const s = await this.prisma.serviceListing.update({
            where: { id },
            data: { status: ServiceStatus.APPROVED, rejectReason: null, publishedAt: new Date() },
            include: { user: { select: { telegramUserId: true } } },
        });
        if (s.user.telegramUserId) {
            this.notifier.notifyUserServiceResult(s.user.telegramUserId.toString(), true, { id: s.id, title: s.title }).catch(() => { });
        }
        return { success: true };
    }

    async reject(id: string, reason: string) {
        const s = await this.prisma.serviceListing.update({
            where: { id },
            data: { status: ServiceStatus.REJECTED, rejectReason: reason?.trim() || null },
            include: { user: { select: { telegramUserId: true } } },
        });
        if (s.user.telegramUserId) {
            this.notifier.notifyUserServiceResult(s.user.telegramUserId.toString(), false, { id: s.id, title: s.title }, reason).catch(() => { });
        }
        return { success: true };
    }

    async pendingCount() {
        return this.prisma.serviceListing.count({ where: { status: ServiceStatus.PENDING } });
    }
}
