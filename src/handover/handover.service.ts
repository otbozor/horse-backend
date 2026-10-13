import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** "90 123 45 67", "+998 (90) 123-45-67", "998901234567" → "+998901234567" */
export function normalizeUzPhone(raw: string): string | null {
    const d = raw.replace(/\D/g, '');
    const full = d.length === 9 ? `998${d}` : d;
    return /^998\d{9}$/.test(full) ? `+${full}` : null;
}

export interface HandoverInfo {
    sellerId: string;
    sellerName: string;
    sellerPhone: string | null;
    /** Sotuvchining Telegram'i allaqachon ulangan — QR shart emas */
    linked: boolean;
    /** t.me/<bot>?start=claim_<kod> — sotuvchi skanerlaydi */
    claimUrl: string | null;
    listingUrl: string;
}

/**
 * Admin sotuvchi nomidan e'lon joylaydi: e'lon sotuvchining akkauntiga biriktiriladi
 * (bor bo'lsa — telefon bo'yicha topiladi, yo'q bo'lsa yangi ochiladi), sotuvchi QR/havola orqali
 * o'z Telegram'ini ulaydi va e'lonlarini o'zi boshqaradi.
 */
@Injectable()
export class HandoverService {
    private readonly bot: string;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
    ) {
        this.bot = (config.get<string>('TELEGRAM_BOT_USERNAME') || 'otbozor_bot').replace(/^@/, '');
    }

    private newCode() {
        return randomBytes(9).toString('base64url'); // 12 belgi, taxmin qilib bo'lmaydi
    }

    /** Telefon bo'yicha sotuvchi (faol) yoki yangi akkaunt */
    async findOrCreateSeller(name: string, rawPhone: string) {
        const phone = normalizeUzPhone(rawPhone);
        if (!phone) throw new BadRequestException("Telefon raqami noto'g'ri (masalan: 90 123 45 67)");
        const displayName = name.trim().slice(0, 80);
        if (displayName.length < 2) throw new BadRequestException('Sotuvchi ismini yozing');
        const existing = await this.prisma.user.findFirst({
            where: { phone, status: 'ACTIVE' },
            orderBy: { telegramUserId: { sort: 'desc', nulls: 'last' } }, // Telegram'i borini afzal ko'ramiz
        });
        if (existing) return existing;
        return this.prisma.user.create({
            data: { displayName, phone, status: 'ACTIVE', isVerified: false },
        });
    }

    /** Sotuvchining Telegram'i ulanmagan bo'lsa — bir martalik ulash havolasi */
    async info(listingId: string): Promise<HandoverInfo> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            select: { id: true, user: { select: { id: true, displayName: true, phone: true, telegramUserId: true, claimCode: true } } },
        });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        const u = listing.user;
        let claimUrl: string | null = null;
        if (!u.telegramUserId) {
            const code = u.claimCode ?? (await this.prisma.user.update({ where: { id: u.id }, data: { claimCode: this.newCode() } })).claimCode;
            claimUrl = `https://t.me/${this.bot}?start=claim_${code}`;
        }
        return {
            sellerId: u.id,
            sellerName: u.displayName,
            sellerPhone: u.phone,
            linked: Boolean(u.telegramUserId),
            claimUrl,
            listingUrl: `https://t.me/${this.bot}?startapp=l_${listing.id}`,
        };
    }

    /**
     * Sotuvchi QR'ni skanerladi (/start claim_<kod>): Telegram akkauntini ulaymiz.
     * Agar bu Telegram'da allaqachon akkaunt bo'lsa — e'lonlar o'sha akkauntga ko'chadi.
     */
    async claim(code: string, tg: { id: number; username?: string; firstName?: string; lastName?: string }) {
        const placeholder = await this.prisma.user.findUnique({ where: { claimCode: code } });
        if (!placeholder || placeholder.telegramUserId || placeholder.status !== 'ACTIVE') return { ok: false as const };
        const telegramUserId = BigInt(tg.id);
        const existing = await this.prisma.user.findUnique({ where: { telegramUserId } });

        if (existing && existing.id !== placeholder.id) {
            const moved = await this.prisma.$transaction(async (tx) => {
                const r = await tx.horseListing.updateMany({ where: { userId: placeholder.id }, data: { userId: existing.id } });
                await tx.user.update({ where: { id: existing.id }, data: { phone: existing.phone ?? placeholder.phone } });
                // Bo'sh qolgan vaqtinchalik akkaunt yopiladi (telefon bo'yicha qayta topilmasin)
                await tx.user.update({ where: { id: placeholder.id }, data: { status: 'DELETED', phone: null, claimCode: null } });
                return r.count;
            });
            return { ok: true as const, name: existing.displayName, listings: moved };
        }

        await this.prisma.user.update({
            where: { id: placeholder.id },
            data: {
                telegramUserId,
                telegramUsername: tg.username || `user_${tg.id}`,
                isVerified: true,
                claimCode: null,
                lastLoginAt: new Date(),
            },
        });
        const listings = await this.prisma.horseListing.count({ where: { userId: placeholder.id } });
        return { ok: true as const, name: placeholder.displayName, listings };
    }
}
