import { HttpException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { ChatService } from '../chat/chat.service';
import { ListingsService } from '../listings/listings.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildTitle, ParsedListing, parseListingText, Place } from './listing-parser';

const MAX_PHOTOS = 10;
/** Albom rasmlari ketma-ket keladi — oxirgisidan keyin shuncha kutib, birga qayta ishlaymiz */
const DEBOUNCE_MS = 2500;
const SESSION_TTL_MS = 30 * 60_000;

interface Session {
    chatId: number;
    photos: string[]; // Telegram file_id
    uploaded: Map<string, string>; // file_id → Cloudinary url
    texts: string[];
    draftId?: string;
    askedFor?: 'photos' | 'text';
    timer?: NodeJS.Timeout;
    lastAt: number;
    busy?: boolean;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n: number, c: string) => (c === 'USD' ? `$${n.toLocaleString('en-US')}` : `${n.toLocaleString('ru-RU')} so'm`);

const EXAMPLE =
    "<i>Masalan: Qorabayir ayg'ir, 5 yosh, to'riq. Ko'pkariga tayyor. Samarqand, Urgut. Narxi 80 mln. Tel: 90 123 45 67</i>";

/**
 * Botga yozib e'lon joylash: sotuvchi rasmlar + oddiy matn yuboradi, bot qoralama e'lon tayyorlaydi
 * (zot, jins, yosh, rang, viloyat, narx…), ko'rsatadi va bir bosishda tekshiruvga yuboradi.
 */
@Injectable()
export class BotListingService implements OnModuleInit {
    private readonly logger = new Logger(BotListingService.name);
    private readonly sessions = new Map<number, Session>();
    private places: { regions: Place[]; districts: Place[]; breeds: Map<string, string>; at: number } | null = null;
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly media: MediaService,
        private readonly listings: ListingsService,
        private readonly chat: ChatService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    onModuleInit() {
        // Chat relay o'zi hal qilmagan xabarlar shu yerga keladi (sotuvchi bilan yozishma ustun)
        this.chat.addMessageHook((ctx) => this.onMessage(ctx));
    }

    // ---------- Xabarlarni qabul qilish ----------

    private async onMessage(ctx: Context): Promise<boolean> {
        if (ctx.chat?.type !== 'private' || !ctx.from || !ctx.message) return false;
        const msg = ctx.message as any;
        const tgId = ctx.from.id;
        let s = this.sessions.get(tgId);
        if (s && Date.now() - s.lastAt > SESSION_TTL_MS) {
            this.sessions.delete(tgId);
            s = undefined;
        }

        const fileId: string | undefined = msg.photo?.length
            ? msg.photo[msg.photo.length - 1].file_id
            : msg.document?.mime_type?.startsWith('image/')
                ? msg.document.file_id
                : undefined;
        const text: string | undefined = (msg.caption ?? msg.text)?.trim();

        if (fileId) {
            s ??= this.newSession(tgId, ctx.chat.id);
            if (s.photos.length < MAX_PHOTOS && !s.photos.includes(fileId)) s.photos.push(fileId);
            if (text) s.texts.push(text);
            this.schedule(tgId, s);
            return true;
        }

        if (text && !text.startsWith('/')) {
            // Davom etayotgan e'lon (yetishmagan ma'lumotni yozyapti) yoki e'longa o'xshagan yangi matn
            if (s) {
                s.texts.push(text);
                this.schedule(tgId, s);
                return true;
            }
            const places = await this.loadPlaces();
            if (parseListingText(text, places.regions, places.districts).score >= 2) {
                s = this.newSession(tgId, ctx.chat.id);
                s.texts.push(text);
                this.schedule(tgId, s);
                return true;
            }
        }
        return false;
    }

    private newSession(tgId: number, chatId: number): Session {
        const s: Session = { chatId, photos: [], uploaded: new Map(), texts: [], lastAt: Date.now() };
        this.sessions.set(tgId, s);
        return s;
    }

    private schedule(tgId: number, s: Session) {
        s.lastAt = Date.now();
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => void this.process(tgId).catch((e) => this.logger.warn(`Bot e'lon: ${(e as Error).message}`)), DEBOUNCE_MS);
    }

    private send(chatId: number, html: string, reply_markup?: InlineKeyboardMarkup) {
        return this.bot.telegram.sendMessage(chatId, html, { parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
    }

    // ---------- Qoralama tayyorlash ----------

    private async process(tgId: number) {
        const s = this.sessions.get(tgId);
        if (!s || s.busy) return;
        if (!s.draftId && !s.photos.length) {
            if (s.askedFor !== 'photos') {
                s.askedFor = 'photos';
                await this.send(s.chatId, "📸 Ajoyib! Endi otning <b>rasmlarini</b> yuboring (1–10 ta, albom qilib ham bo'ladi).");
            }
            return;
        }
        if (!s.draftId && !s.texts.length) {
            if (s.askedFor !== 'text') {
                s.askedFor = 'text';
                await this.send(
                    s.chatId,
                    `✍️ Rasmlar qabul qilindi (${s.photos.length} ta). Endi otingiz haqida bir xabarda yozing: <b>zoti, jinsi, yoshi, rangi, viloyati va narxi</b>.\n\n${EXAMPLE}`,
                );
            }
            return;
        }

        s.busy = true;
        try {
            const user = await this.ensureUser(tgId, s.chatId);
            if (!user) return;
            const places = await this.loadPlaces();
            const text = s.texts.join('\n');
            const p = parseListingText(text, places.regions, places.districts);

            if (s.photos.some((f) => !s.uploaded.has(f))) await this.send(s.chatId, '⏳ Rasmlar yuklanmoqda va e\'lon tayyorlanmoqda…');
            for (const f of s.photos) {
                if (s.uploaded.has(f)) continue;
                const url = await this.uploadPhoto(f).catch((e) => {
                    this.logger.warn(`Rasm yuklanmadi: ${(e as Error).message}`);
                    return null;
                });
                if (url) s.uploaded.set(f, url);
            }

            const breedId = p.breedName ? places.breeds.get(p.breedName) : undefined;
            if (!s.draftId) {
                const draft = await this.listings.createDraft(user.id, {
                    title: buildTitle(p),
                    description: text,
                    regionId: p.regionId,
                    districtId: p.districtId,
                    purpose: p.purpose,
                    gender: p.gender,
                    breedId,
                    ageYears: p.ageYears,
                    color: p.color as string,
                    priceAmount: p.priceAmount ?? 0,
                    priceCurrency: p.priceCurrency,
                    hasPassport: p.hasPassport,
                    contactPhone: p.phone,
                } as any);
                s.draftId = draft.id;
            } else {
                // Yetishmagan ma'lumot yozildi — topilganlarini qo'shamiz (bor qiymatlarni o'chirmaymiz)
                const cur = await this.prisma.horseListing.findUnique({ where: { id: s.draftId } });
                if (!cur || cur.status !== 'DRAFT') {
                    this.sessions.delete(tgId);
                    return;
                }
                const merged: ParsedListing = {
                    score: 0,
                    breedName: p.breedName,
                    gender: p.gender ?? (cur.gender as ParsedListing['gender']) ?? undefined,
                    ageYears: p.ageYears ?? cur.ageYears ?? undefined,
                };
                await this.prisma.horseListing.update({
                    where: { id: s.draftId },
                    data: {
                        title: p.breedName || p.gender || p.ageYears !== undefined ? buildTitle({ ...merged, breedName: p.breedName ?? (await this.breedName(cur.breedId)) }) : undefined,
                        description: text,
                        regionId: p.regionId ?? undefined,
                        districtId: p.districtId ?? undefined,
                        purpose: p.purpose ?? undefined,
                        gender: p.gender ?? undefined,
                        breedId: breedId ?? undefined,
                        ageYears: p.ageYears ?? undefined,
                        color: p.color ?? undefined,
                        priceAmount: p.priceAmount ?? undefined,
                        priceCurrency: p.priceAmount ? p.priceCurrency : undefined,
                        hasPassport: p.hasPassport ?? undefined,
                        contactPhone: p.phone ?? undefined,
                    },
                });
            }

            const urls = s.photos.map((f) => s.uploaded.get(f)).filter((u): u is string => Boolean(u));
            if (urls.length) await this.media.attachMediaToListing(s.draftId, urls.map((url, i) => ({ url, type: 'IMAGE' as const, sortOrder: i })));
            await this.showDraft(s.chatId, s.draftId);
        } finally {
            s.busy = false;
        }
    }

    private async breedName(breedId: string | null) {
        if (!breedId) return undefined;
        const places = await this.loadPlaces();
        for (const [name, id] of places.breeds) if (id === breedId) return name;
        return undefined;
    }

    /** Qoralama kartasi: topilgan maydonlar, yetishmaganlar va tugmalar */
    private async showDraft(chatId: number, id: string) {
        const l = await this.prisma.horseListing.findUnique({
            where: { id },
            include: { region: { select: { nameUz: true } }, district: { select: { nameUz: true } }, breed: { select: { name: true } }, media: { orderBy: { sortOrder: 'asc' } } },
        });
        if (!l) return;
        const price = Number(l.priceAmount);
        const missing: string[] = [];
        if (!l.media.length) missing.push('📸 rasm');
        if (!l.regionId) missing.push('📍 viloyat');
        if (!price) missing.push("💰 narx (masalan: 80 mln yoki 5000$)");

        const rows = [
            `<b>${esc(l.title)}</b>`,
            '',
            `💰 Narxi: ${price ? money(price, l.priceCurrency) : '<i>yozilmagan</i>'}`,
            `📍 Joylashuvi: ${l.region ? esc(l.region.nameUz) + (l.district ? `, ${esc(l.district.nameUz)}` : '') : '<i>yozilmagan</i>'}`,
            l.breed ? `🐴 Zoti: ${esc(l.breed.name)}` : null,
            l.ageYears !== null ? `🎂 Yoshi: ${l.ageYears === 0 ? 'qulun' : `${l.ageYears} yosh`}` : null,
            l.color ? `🎨 Rangi: ${esc(l.color)}` : null,
            `🖼 Rasmlar: ${l.media.length} ta`,
        ].filter((x) => x !== null);
        const head = '📝 <b>E\'lon qoralamasi tayyor</b>\n\n';
        const tail = missing.length
            ? `\n\n❗️ Yana kerak: <b>${missing.join(', ')}</b>.\nShu yerga yozib yuboring — e'longa qo'shaman.`
            : "\n\nHammasi to'g'rimi? «Joylash» ni bosing — moderator tekshirgach e'lon bozorga chiqadi.";

        const keyboard: InlineKeyboardMarkup['inline_keyboard'] = [];
        if (!missing.length) keyboard.push([{ text: '✅ Joylash', callback_data: `bl:s:${id}` }]);
        if (this.miniAppUrl) keyboard.push([{ text: '✏️ Tahrirlash', web_app: { url: `${this.miniAppUrl}/listings/${id}/edit` } }]);
        keyboard.push([{ text: '🗑 Bekor qilish', callback_data: `bl:x:${id}` }]);

        const caption = head + rows.join('\n') + tail;
        const photo = l.media[0]?.url;
        if (photo) await this.bot.telegram.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        else await this.send(chatId, caption, { inline_keyboard: keyboard });
    }

    // ---------- Tugmalar ----------

    async submit(ctx: Context, id: string) {
        const tgId = ctx.from?.id;
        if (!tgId) return;
        const user = await this.prisma.user.findUnique({ where: { telegramUserId: BigInt(tgId) }, select: { id: true } });
        if (!user) return;
        try {
            await this.listings.submitForReview(user.id, id);
            this.sessions.delete(tgId);
            await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
            await ctx.reply("✅ <b>E'lon tekshiruvga yuborildi!</b>\nModerator tasdiqlagach bozorga chiqadi va sizga xabar beramiz.", {
                parse_mode: 'HTML',
                reply_markup: this.miniAppUrl ? { inline_keyboard: [[{ text: "📋 Mening e'lonlarim", web_app: { url: `${this.miniAppUrl}/my-listings` } }]] } : undefined,
            });
        } catch (e) {
            const status = e instanceof HttpException ? e.getStatus() : 0;
            if (status === 402 && this.miniAppUrl) {
                await ctx.reply("💳 Bepul e'lonlaringiz tugagan. E'lonni joylash uchun paketni tanlang:", {
                    reply_markup: { inline_keyboard: [[{ text: "💳 To'lash va joylash", web_app: { url: `${this.miniAppUrl}/listings/${id}/publish` } }]] },
                });
            } else {
                await ctx.reply(`❌ Joylab bo'lmadi: ${(e as Error).message}. «Tahrirlash» orqali tekshirib ko'ring.`);
            }
        }
    }

    async cancel(ctx: Context, id: string) {
        const tgId = ctx.from?.id;
        if (!tgId) return;
        const user = await this.prisma.user.findUnique({ where: { telegramUserId: BigInt(tgId) }, select: { id: true } });
        if (user) await this.prisma.horseListing.deleteMany({ where: { id, userId: user.id, status: 'DRAFT' } });
        this.sessions.delete(tgId);
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        await ctx.reply("🗑 Qoralama o'chirildi. Yangi e'lon uchun istalgan vaqtda rasm va ma'lumot yuboring.");
    }

    // ---------- Yordamchilar ----------

    /** Botga birinchi marta yozgan odam ham e'lon joylay olsin — Mini App kabi ro'yxatdan o'tkazamiz */
    private async ensureUser(tgId: number, chatId: number) {
        const telegramUserId = BigInt(tgId);
        let user = await this.prisma.user.findUnique({ where: { telegramUserId }, select: { id: true, status: true } });
        if (user && user.status !== 'ACTIVE') {
            await this.send(chatId, '⛔️ Akkauntingiz faol emas. Yordam: /help');
            return null;
        }
        if (!user) {
            const chat = await this.bot.telegram.getChat(tgId).catch(() => null);
            const c = (chat ?? {}) as { first_name?: string; last_name?: string; username?: string };
            user = await this.prisma.user.create({
                data: {
                    telegramUserId,
                    telegramUsername: c.username || `user_${tgId}`,
                    displayName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi',
                    isVerified: true,
                    status: 'ACTIVE',
                    lastLoginAt: new Date(),
                },
                select: { id: true, status: true },
            });
        }
        return user;
    }

    private async uploadPhoto(fileId: string): Promise<string> {
        const link = await this.bot.telegram.getFileLink(fileId);
        const res = await fetch(link.toString(), { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`Telegram file ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const { url } = await this.media.uploadFile({ buffer, mimetype: 'image/jpeg', size: buffer.length, originalname: 'telegram.jpg' } as Express.Multer.File, 'listings');
        return url;
    }

    private async loadPlaces() {
        if (this.places && Date.now() - this.places.at < 3_600_000) return this.places;
        const [regions, districts, breeds] = await Promise.all([
            this.prisma.region.findMany({ select: { id: true, nameUz: true } }),
            this.prisma.district.findMany({ select: { id: true, nameUz: true, regionId: true } }),
            this.prisma.breed.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        ]);
        this.places = {
            regions: regions.map((r) => ({ id: r.id, name: r.nameUz })),
            districts: districts.map((d) => ({ id: d.id, name: d.nameUz, regionId: d.regionId })),
            breeds: new Map(breeds.map((b) => [b.name, b.id])),
            at: Date.now(),
        };
        return this.places;
    }
}
