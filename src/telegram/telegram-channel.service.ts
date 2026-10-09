import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';

export interface ChannelConfig {
    enabled: boolean;
    /** Bot post yuboradigan chat: @username yoki -100... */
    chatId: string;
    /** Ommaviy havola (captionlar va mini app uchun) */
    url: string;
}

interface ListingForChannel {
    id: string;
    slug: string;
    title: string;
    priceAmount: { toString(): string } | number | null;
    priceCurrency: string | null;
    ageYears: number | null;
    isPremium: boolean;
    isTop: boolean;
    region?: { nameUz: string } | null;
    district?: { nameUz: string } | null;
    breed?: { name: string } | null;
    media?: { url: string; thumbUrl?: string | null }[];
    user?: { phone: string | null } | null;
}

@Injectable()
export class TelegramChannelService {
    private readonly logger = new Logger(TelegramChannelService.name);
    private readonly channelId: string;
    private readonly adminChatIds: string[];
    private readonly frontendUrl: string;
    private readonly adminUsername: string;
    private readonly miniAppUrl: string;

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) {
        this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID') || '';
        const raw = this.configService.get<string>('TELEGRAM_ADMIN_CHAT_IDS') || '';
        this.adminChatIds = raw.split(',').map(s => s.trim()).filter(Boolean);
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
        this.adminUsername = this.configService.get<string>('TELEGRAM_ADMIN_USERNAME') || '@otbozor_admin';
        this.miniAppUrl = (this.configService.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    /** Kanal sozlamalari: admin paneldagi qiymatlar env'dagidan ustun turadi */
    async getChannelConfig(): Promise<ChannelConfig> {
        const rows = await this.prisma.appSetting.findMany({ where: { key: { in: ['channel_enabled', 'channel_chat_id'] } } });
        const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        const chatId = (map.channel_chat_id ?? this.channelId).trim();
        return { enabled: map.channel_enabled !== 'false' && Boolean(chatId), chatId, url: TelegramChannelService.publicUrl(chatId) };
    }

    static publicUrl(chatId: string): string {
        return chatId.startsWith('@') ? `https://t.me/${chatId.slice(1)}` : 'https://t.me/otbozor_rasmiy';
    }

    /** Post yuborish kerak bo'lsa kanal sozlamalarini qaytaradi, aks holda null */
    private async activeChannel(kind: string): Promise<ChannelConfig | null> {
        const cfg = await this.getChannelConfig();
        if (!cfg.enabled) {
            this.logger.log(`Channel posting disabled — skipping ${kind}`);
            return null;
        }
        return cfg;
    }

    // =================== Kanal postlari (joylash va keyinchalik tahrirlash) ===================

    private money(n: number, currency: string) {
        return currency === 'USD' ? `$${n.toLocaleString('en-US')}` : `${n.toLocaleString('uz-UZ')} so'm`;
    }

    /** Mini App'ni Telegram ichida ochadigan havola (kanal tugmalarida web_app ishlamaydi) */
    private appLink(startParam?: string) {
        const bot = (this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'otbozor_bot').replace(/^@/, '');
        return `https://t.me/${bot}/app${startParam ? `?startapp=${startParam}` : ''}`;
    }

    private botAppLink(listingId: string) {
        return this.appLink(`l_${listingId}`);
    }

    private footer(channelUrl: string) {
        return (
            `\n\nOtbozor.uz — ot savdosi uchun maxsus yaratilgan platforma.\n\n` +
            `<b><a href="${channelUrl}">Telegram kanal</a></b> | ` +
            `<b><a href="https://t.me/otbozor_rasmiy_guruh">Telegram guruh</a></b> | ` +
            `<b><a href="https://instagram.com/otbozor.uz">Instagram</a></b>`
        );
    }

    /** E'lon posti matni: faol / sotildi / yopildi holatlari */
    private listingCaption(
        l: ListingForChannel & { previousPrice?: { toString(): string } | number | null },
        channelUrl: string,
        state: 'active' | 'sold' | 'closed' = 'active',
        soldViaOtbozor = false,
    ) {
        const currency = l.priceCurrency || 'UZS';
        const priceNum = l.priceAmount ? Number(l.priceAmount.toString()) : 0;
        const prev = l.previousPrice ? Number(l.previousPrice.toString()) : 0;
        const price = priceNum ? this.money(priceNum, currency) : "Narx ko'rsatilmagan";
        const region = l.region?.nameUz || '';
        const district = l.district?.nameUz || '';
        const breed = l.breed?.name || '';
        const age = l.ageYears ? `${l.ageYears} yosh` : '';

        let c = '';
        if (state === 'sold') c += `✅ <b>SOTILDI</b>${soldViaOtbozor ? ' — Otbozor orqali' : ''}\n\n`;
        if (state === 'closed') c += `⛔️ <b>E'lon faol emas</b>\n\n`;
        c += state === 'active' ? `<b>${this.escapeHtml(l.title)}</b>\n\n` : `<s>${this.escapeHtml(l.title)}</s>\n\n`;
        c += prev > priceNum && state === 'active'
            ? `<b>💰 Narxi:</b> <s>${this.money(prev, currency)}</s> ➜ <b>${price}</b> 🔻\n`
            : `<b>💰 Narxi:</b> ${price}\n`;
        if (region) c += `<b>📍 Joylashuvi:</b> ${this.escapeHtml(region)}${district ? ', ' + this.escapeHtml(district) : ''}\n`;
        if (breed) c += `<b>${this.getBreedEmoji(breed)} Zoti:</b> ${this.escapeHtml(breed)}\n`;
        if (age) c += `<b>${this.getAgeEmoji(l.ageYears)} Yoshi:</b> ${age}\n`;
        if (state === 'sold') c += `\n🤝 <b>Olganga ham, sotganga ham baraka bersin!</b>`;
        return c + this.footer(channelUrl);
    }

    /** Tugmalar Mini App'ni ochadi: faol e'lon — e'lonning o'zi, sotilgan/yopilgan — bozor */
    private listingKeyboard(listingId: string, _slug: string, state: 'active' | 'sold' | 'closed') {
        if (state !== 'active') {
            return { inline_keyboard: [[{ text: "🐴 Boshqa otlarni ko'rish", url: this.appLink() }]] };
        }
        return {
            inline_keyboard: [
                [{ text: "📱 E'lonni ochish", url: this.botAppLink(listingId) }],
                [{ text: "➕ E'lon joylash", url: this.appLink('create') }],
            ],
        };
    }

    /** Auksion posti matni: boshlangan / takliflar / yakunlangan / bekor qilingan */
    private auctionCaption(
        l: { title: string; ageYears: number | null; region?: { nameUz: string } | null; breed?: { name: string } | null },
        a: { status: string; currency: string; startPrice: number; minStep: number; currentPrice: number | null; bidCount: number; endsAt: Date; cancelReason?: string | null },
    ) {
        const lt = new Date(a.endsAt.getTime() + 5 * 3600000);
        const ends = `${String(lt.getUTCDate()).padStart(2, '0')}.${String(lt.getUTCMonth() + 1).padStart(2, '0')} soat ${String(lt.getUTCHours()).padStart(2, '0')}:${String(lt.getUTCMinutes()).padStart(2, '0')}`;
        let c = '';
        if (a.status === 'ENDED') c += a.currentPrice ? `🏁 <b>AUKSION YAKUNLANDI!</b>\n\n` : `⏱ <b>AUKSION YAKUNLANDI</b> — taklif tushmadi\n\n`;
        else if (a.status === 'CANCELLED') c += `🛑 <b>AUKSION BEKOR QILINDI</b>\n\n`;
        else c += `🔨 <b>KIM OSHDI SAVDOSI!</b>\n\n`;
        c += `<b>${this.escapeHtml(l.title)}</b>\n`;
        if (l.breed) c += `🐴 Zoti: ${this.escapeHtml(l.breed.name)}\n`;
        if (l.ageYears != null) c += `📅 Yoshi: ${l.ageYears} yosh\n`;
        if (l.region) c += `📍 ${this.escapeHtml(l.region.nameUz)}\n`;
        c += '\n';
        if (a.status === 'ENDED' && a.currentPrice) {
            c += `💰 Yakuniy narx: <b>${this.money(a.currentPrice, a.currency)}</b>\n`;
            c += `👥 ${a.bidCount} ta taklif · boshlang'ich ${this.money(a.startPrice, a.currency)}\n\n`;
            c += `🤝 <b>G'olibga ham, sotuvchiga ham baraka bersin!</b>`;
        } else if (a.status === 'CANCELLED') {
            c += `💰 Boshlang'ich narx: ${this.money(a.startPrice, a.currency)}\n`;
            if (a.cancelReason) c += `📝 ${this.escapeHtml(a.cancelReason)}\n`;
        } else if (a.currentPrice) {
            c += `💰 Joriy narx: <b>${this.money(a.currentPrice, a.currency)}</b> 🔥\n`;
            c += `👥 ${a.bidCount} ta taklif · boshlang'ich ${this.money(a.startPrice, a.currency)}\n`;
            c += `➕ Keyingi taklif: kamida ${this.money(a.currentPrice + a.minStep, a.currency)}\n`;
            c += `⏳ Tugaydi: <b>${ends}</b>\n\nEng yuqori narxni taklif qilgan xaridor yutadi!`;
        } else {
            c += `💰 Boshlang'ich narx: <b>${this.money(a.startPrice, a.currency)}</b>\n`;
            c += `➕ Qadam: ${this.money(a.minStep, a.currency)}\n`;
            c += `⏳ Tugaydi: <b>${ends}</b>\n\nEng yuqori narxni taklif qilgan xaridor yutadi!`;
        }
        return c;
    }

    private auctionKeyboard(listingId: string, active: boolean) {
        return active
            ? { inline_keyboard: [[{ text: '🔨 Auksionda qatnashish', url: this.botAppLink(listingId) }]] }
            : { inline_keyboard: [[{ text: "🐴 E'lonni ko'rish", url: this.botAppLink(listingId) }]] };
    }

    private async sendPost(chatId: string, caption: string, reply_markup: any, photo?: string | null) {
        return photo
            ? this.bot.telegram.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML', reply_markup })
            : this.bot.telegram.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
    }

    private async editPost(post: { chatId: string; messageId: number; isPhoto: boolean }, caption: string, reply_markup: any) {
        try {
            if (post.isPhoto) await this.bot.telegram.editMessageCaption(post.chatId, post.messageId, undefined, caption, { parse_mode: 'HTML', reply_markup });
            else await this.bot.telegram.editMessageText(post.chatId, post.messageId, undefined, caption, { parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
        } catch (e) {
            if (!/not modified/i.test((e as Error).message)) this.logger.warn(`Channel post edit failed: ${(e as Error).message}`);
        }
    }

    private readonly listingForChannelInclude = {
        region: { select: { nameUz: true } },
        district: { select: { nameUz: true } },
        breed: { select: { name: true } },
        user: { select: { phone: true } },
        media: { where: { type: 'IMAGE' as const }, orderBy: { sortOrder: 'asc' as const } },
    };

    async postListingToChannel(listing: ListingForChannel): Promise<void> {
        const channel = await this.activeChannel(`listing ${listing.id}`);
        if (!channel) return;
        try {
            const photo = listing.media?.find((m) => m.url)?.url ?? null;
            const msg = await this.sendPost(channel.chatId, this.listingCaption(listing, channel.url), this.listingKeyboard(listing.id, listing.slug, 'active'), photo);
            await this.prisma.channelPost.create({
                data: { kind: 'LISTING', listingId: listing.id, chatId: channel.chatId, messageId: msg.message_id, isPhoto: Boolean(photo) },
            });
            this.logger.log(`✅ Listing posted to Telegram channel: ${listing.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post listing to Telegram channel: ${error.message}`);
        }
    }

    /**
     * Kanaldagi e'lon postini yangilash: narx o'zgarishi, sotildi yoki yopildi.
     * Sotilganda postga tabrik javobi ham yuboriladi.
     */
    async refreshListingPost(listingId: string, state: 'active' | 'sold' | 'closed', saleSource?: string | null): Promise<void> {
        const posts = await this.prisma.channelPost.findMany({ where: { listingId, kind: 'LISTING' } });
        if (!posts.length) return;
        const l = await this.prisma.horseListing.findUnique({ where: { id: listingId }, include: this.listingForChannelInclude });
        if (!l) return;
        const cfg = await this.getChannelConfig();
        const caption = this.listingCaption(l, cfg.url, state, saleSource === 'OTBOZOR');
        for (const post of posts) {
            await this.editPost(post, caption, this.listingKeyboard(l.id, l.slug, state));
            if (state === 'sold') {
                await this.bot.telegram
                    .sendMessage(
                        post.chatId,
                        `🎉 <b>Ot sotildi!</b>\n\n🐴 ${this.escapeHtml(l.title)}\n\n🤝 Olganga ham, sotganga ham baraka bersin!` +
                        (saleSource === 'OTBOZOR' ? `\n\n✅ Otbozor orqali sotildi. Otingizni siz ham shu yerda tez soting!` : ''),
                        { parse_mode: 'HTML', reply_parameters: { message_id: post.messageId, allow_sending_without_reply: true } },
                    )
                    .catch((e) => this.logger.warn(`Sold reply failed: ${e.message}`));
            }
        }
    }

    /** Kanalga: "Kim oshdi savdosi boshlandi" — Mini App'dagi auksionga tugma bilan */
    async postAuctionToChannel(
        listing: { id: string; title: string; ageYears: number | null; region?: { nameUz: string } | null; breed?: { name: string } | null; media?: { url: string }[] },
        auction: { id: string; startPrice: number; minStep: number; currency: string; endsAt: Date },
    ): Promise<void> {
        const channel = await this.activeChannel(`auction ${listing.id}`);
        if (!channel) return;
        try {
            const photo = listing.media?.[0]?.url ?? null;
            const caption = this.auctionCaption(listing, { ...auction, status: 'ACTIVE', currentPrice: null, bidCount: 0 });
            const msg = await this.sendPost(channel.chatId, caption, this.auctionKeyboard(listing.id, true), photo);
            await this.prisma.channelPost.create({
                data: { kind: 'AUCTION', listingId: listing.id, auctionId: auction.id, chatId: channel.chatId, messageId: msg.message_id, isPhoto: Boolean(photo) },
            });
            this.logger.log(`✅ Auction posted to channel: ${listing.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post auction to channel: ${error.message}`);
        }
    }

    /** Auksion postini joriy holatga keltirish (yangi taklif, yakun, bekor qilish) */
    async refreshAuctionPost(auctionId: string): Promise<void> {
        const posts = await this.prisma.channelPost.findMany({ where: { auctionId, kind: 'AUCTION' } });
        if (!posts.length) return;
        const a = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: { select: { id: true, title: true, ageYears: true, region: { select: { nameUz: true } }, breed: { select: { name: true } } } },
                _count: { select: { bids: true } },
            },
        });
        if (!a) return;
        const caption = this.auctionCaption(a.listing, {
            status: a.status,
            currency: a.currency,
            startPrice: Number(a.startPrice),
            minStep: Number(a.minStep),
            currentPrice: a.currentPrice ? Number(a.currentPrice) : null,
            bidCount: a._count.bids,
            endsAt: a.endsAt,
            cancelReason: a.cancelReason,
        });
        for (const post of posts) await this.editPost(post, caption, this.auctionKeyboard(a.listing.id, a.status === 'ACTIVE'));
    }

    /** Admin uchun: kanalga tushadigan barcha ko'rinishlarni o'z chatiga yuborish */
    async sendChannelPreview(chatId: string): Promise<number> {
        const cfg = await this.getChannelConfig();
        const real = await this.prisma.horseListing.findFirst({
            where: { status: 'APPROVED', media: { some: { type: 'IMAGE' } } },
            orderBy: { publishedAt: 'desc' },
            include: this.listingForChannelInclude,
        });
        const sample: ListingForChannel & { previousPrice?: { toString(): string } | number | null } = real ?? {
            id: '00000000-0000-0000-0000-000000000000', slug: 'namuna', title: "Qorabayir ayg'ir, 5 yosh — ko'pkariga tayyor",
            priceAmount: 45000000, priceCurrency: 'UZS', ageYears: 5, isPremium: false, isTop: false,
            region: { nameUz: 'Qashqadaryo' }, district: { nameUz: 'Shahrisabz' }, breed: { name: 'Qorabayir' }, media: [],
        };
        const photo = sample.media?.[0]?.url ?? null;
        const price = Number(sample.priceAmount?.toString() ?? 0) || 45000000;
        const steps: [string, string, any][] = [
            ['1️⃣ Yangi e\'lon (tasdiqlanganda yoki reklama qilinganda)', this.listingCaption(sample, cfg.url), this.listingKeyboard(sample.id, sample.slug, 'active')],
            ['2️⃣ Narx tushirilganda — post shu ko\'rinishga tahrirlanadi', this.listingCaption({ ...sample, priceAmount: Math.round(price * 0.9), previousPrice: price }, cfg.url), this.listingKeyboard(sample.id, sample.slug, 'active')],
            ['3️⃣ "Otbozor orqali sotildi" deb belgilanganda — post tahrirlanadi', this.listingCaption(sample, cfg.url, 'sold', true), this.listingKeyboard(sample.id, sample.slug, 'sold')],
            ['4️⃣ Sotilmay yopilganda', this.listingCaption(sample, cfg.url, 'closed'), this.listingKeyboard(sample.id, sample.slug, 'closed')],
        ];
        const ends = new Date(Date.now() + 3 * 86400000);
        const step = Math.max(1000, Math.round(price * 0.8 * 0.02 / 1000) * 1000);
        const base = { currency: sample.priceCurrency || 'UZS', startPrice: Math.round(price * 0.8), minStep: step, endsAt: ends };
        steps.push(
            ['5️⃣ Auksion boshlanganda', this.auctionCaption(sample, { ...base, status: 'ACTIVE', currentPrice: null, bidCount: 0 }), this.auctionKeyboard(sample.id, true)],
            ['6️⃣ Har bir yangi taklifda — post yangilanadi', this.auctionCaption(sample, { ...base, status: 'ACTIVE', currentPrice: base.startPrice + step * 3, bidCount: 4 }), this.auctionKeyboard(sample.id, true)],
            ['7️⃣ Auksion yakunlanganda', this.auctionCaption(sample, { ...base, status: 'ENDED', currentPrice: base.startPrice + step * 7, bidCount: 9 }), this.auctionKeyboard(sample.id, false)],
            ['8️⃣ Admin bekor qilganda', this.auctionCaption(sample, { ...base, status: 'CANCELLED', currentPrice: null, bidCount: 2, cancelReason: 'Ot boshqa joyda sotildi' }), this.auctionKeyboard(sample.id, false)],
        );
        await this.bot.telegram.sendMessage(chatId, `📺 <b>Kanal postlari namunasi</b>\n\nQuyida kanalga tushadigan va keyin tahrirlanadigan barcha ko'rinishlar. Kanal: ${this.escapeHtml(cfg.chatId || '—')} (${cfg.enabled ? 'yoqilgan' : "hozir o'chiq"})`, { parse_mode: 'HTML' });
        let sent = 0;
        for (const [label, caption, kb] of steps) {
            await this.bot.telegram.sendMessage(chatId, `<i>${this.escapeHtml(label)}</i>`, { parse_mode: 'HTML' });
            const msg = await this.sendPost(chatId, caption, kb, photo);
            sent++;
            if (label.startsWith('3️⃣')) {
                await this.bot.telegram.sendMessage(
                    chatId,
                    `🎉 <b>Ot sotildi!</b>\n\n🐴 ${this.escapeHtml(sample.title)}\n\n🤝 Olganga ham, sotganga ham baraka bersin!\n\n✅ Otbozor orqali sotildi. Otingizni siz ham shu yerda tez soting!`,
                    { parse_mode: 'HTML', reply_parameters: { message_id: msg.message_id } },
                );
            }
        }
        return sent;
    }


    async notifyAdminNewListing(listing: { id: string; title: string; userId: string; userName?: string }): Promise<void> {
        if (!this.adminChatIds.length) return;
        const adminLink = `${this.frontendUrl}/admin/listings/${listing.id}/preview`;
        const text =
            `🔔 <b>Yangi ot e'loni tasdiqlash kutmoqda</b>\n\n` +
            `🐴 ${this.escapeHtml(listing.title)}\n` +
            (listing.userName ? `👤 ${this.escapeHtml(listing.userName)}\n` : '') +
            `\n<a href="${adminLink}">Admin panelda ko'rish →</a>`;

        // Admin to'g'ridan-to'g'ri Mini App'da ochib, tasdiqlash/rad etishi mumkin
        const extra = this.miniAppButton("📱 Mini App'da ko'rib chiqish", `/listings/${listing.id}`);
        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
            } catch (error) {
                this.logger.error(`❌ Failed to notify admin ${chatId} (new listing): ${error.message}`);
            }
        }
    }

    async notifyAdminNewProduct(product: { id: string; title: string; userName?: string }): Promise<void> {
        if (!this.adminChatIds.length) return;
        const adminLink = `${this.frontendUrl}/admin/products`;
        const text =
            `🔔 <b>Yangi mahsulot tasdiqlash kutmoqda</b>\n\n` +
            `📦 ${this.escapeHtml(product.title)}\n` +
            (product.userName ? `👤 ${this.escapeHtml(product.userName)}\n` : '') +
            `\n<a href="${adminLink}">Admin panelda ko'rish →</a>`;

        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
            } catch (error) {
                this.logger.error(`❌ Failed to notify admin ${chatId} (new product): ${error.message}`);
            }
        }
    }

    /** MINI_APP_URL berilgan bo'lsa, xabarga Mini App'ni ochadigan web_app tugma qo'shadi. */
    private miniAppButton(text: string, path: string) {
        if (!this.miniAppUrl) return {};
        return { reply_markup: { inline_keyboard: [[{ text, web_app: { url: `${this.miniAppUrl}${path}` } }]] } };
    }

    // ---------- Narx taklifi ----------

    /** Sotuvchiga yangi narx taklifi: botda to'g'ridan-to'g'ri Qabul / Rad tugmalari bilan */
    async notifyPriceOffer(
        sellerTelegramId: string,
        offer: { id: string; amount: string; message?: string | null },
        listing: { id: string; title: string; price: string },
        buyerName: string,
    ): Promise<void> {
        const text =
            `💬 <b>Yangi narx taklifi</b>\n\n` +
            `🐴 ${this.escapeHtml(listing.title)}\n` +
            `🏷 Sizning narxingiz: <b>${this.escapeHtml(listing.price)}</b>\n` +
            `💰 Taklif: <b>${this.escapeHtml(offer.amount)}</b>\n` +
            `👤 ${this.escapeHtml(buyerName)}` +
            (offer.message ? `\n\n📝 ${this.escapeHtml(offer.message)}` : '');
        const keyboard: any[][] = [[
            { text: '✅ Qabul qilish', callback_data: `offer:a:${offer.id}` },
            { text: '❌ Rad etish', callback_data: `offer:r:${offer.id}` },
        ]];
        if (this.miniAppUrl) keyboard.push([{ text: "📱 E'lonni ochish", web_app: { url: `${this.miniAppUrl}/listings/${listing.id}` } }]);
        await this.notifications.deliver({
            telegramUserId: sellerTelegramId,
            category: NotificationCategory.OFFERS,
            title: `Yangi narx taklifi: ${offer.amount}`,
            html: text,
            link: '/offers',
            replyMarkup: { inline_keyboard: keyboard },
        });
    }

    /** Xaridorga taklif natijasi; qabul qilinsa sotuvchi kontakti ham yuboriladi */
    async notifyPriceOfferResult(
        buyerTelegramId: string,
        accepted: boolean,
        listing: { id: string; title: string },
        amount: string,
        sellerContact?: { name?: string | null; phone?: string | null; telegram?: string | null },
    ): Promise<void> {
        let text = accepted
            ? `✅ <b>Taklifingiz qabul qilindi!</b>\n\n🐴 ${this.escapeHtml(listing.title)}\n💰 ${this.escapeHtml(amount)}\n\nSotuvchi bilan bog'laning:`
            : `❌ <b>Taklifingiz rad etildi</b>\n\n🐴 ${this.escapeHtml(listing.title)}\n💰 ${this.escapeHtml(amount)}\n\nBoshqa narx taklif qilib ko'rishingiz mumkin.`;
        if (accepted && sellerContact) {
            if (sellerContact.name) text += `\n👤 ${this.escapeHtml(sellerContact.name)}`;
            if (sellerContact.phone) text += `\n📞 ${this.escapeHtml(sellerContact.phone)}`;
            if (sellerContact.telegram) text += `\n✈️ @${this.escapeHtml(sellerContact.telegram.replace(/^@/, ''))}`;
        }
        await this.notifications.deliver({
            telegramUserId: buyerTelegramId,
            category: NotificationCategory.OFFERS,
            title: accepted ? `Taklifingiz qabul qilindi: ${amount}` : `Taklifingiz rad etildi: ${amount}`,
            html: text,
            link: `/listings/${listing.id}`,
            buttonText: "📱 E'lonni ochish",
        });
    }

    // ---------- Saqlangan qidiruv ----------

    /** Saqlangan qidiruvga mos yangi e'lon: rasm + Mini App tugmasi */
    async notifySavedSearchMatch(
        telegramUserId: string,
        searchLabel: string,
        listing: { id: string; title: string; price: string; place?: string | null; photoUrl?: string | null },
    ): Promise<boolean> {
        const caption =
            `🔔 <b>"${this.escapeHtml(searchLabel)}" qidiruvingizga yangi e'lon</b>\n\n` +
            `🐴 ${this.escapeHtml(listing.title)}\n` +
            `💰 <b>${this.escapeHtml(listing.price)}</b>` +
            (listing.place ? `\n📍 ${this.escapeHtml(listing.place)}` : '');
        return this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.SEARCHES,
            title: `"${searchLabel}" qidiruvingizga yangi e'lon`,
            html: caption,
            link: `/listings/${listing.id}`,
            buttonText: "📱 E'lonni ko'rish",
            photoUrl: listing.photoUrl,
        });
    }

    // ---------- "Ot kerak" so'rovlari ----------

    async notifyRequestResponse(
        requesterTelegramId: string,
        request: { id: string; title: string },
        responder: { name: string; phone?: string | null; telegram?: string | null },
        listing?: { id: string; title: string; price: string } | null,
        message?: string | null,
    ): Promise<void> {
        let text =
            `📩 <b>So'rovingizga javob keldi</b>\n\n` +
            `🔎 ${this.escapeHtml(request.title)}\n\n` +
            `👤 ${this.escapeHtml(responder.name)}`;
        if (responder.phone) text += `\n📞 ${this.escapeHtml(responder.phone)}`;
        if (responder.telegram) text += `\n✈️ @${this.escapeHtml(responder.telegram.replace(/^@/, ''))}`;
        if (listing) text += `\n\n🐴 Taklif: <b>${this.escapeHtml(listing.title)}</b> — ${this.escapeHtml(listing.price)}`;
        if (message) text += `\n\n📝 ${this.escapeHtml(message)}`;
        await this.notifications.deliver({
            telegramUserId: requesterTelegramId,
            category: NotificationCategory.OFFERS,
            title: `So'rovingizga javob keldi: ${request.title}`,
            html: text,
            link: listing ? `/listings/${listing.id}` : `/requests/${request.id}`,
            buttonText: listing ? "📱 Taklif qilingan otni ko'rish" : "📱 So'rovni ochish",
        });
    }

    // ---------- Xizmatlar ----------

    async notifyAdminNewService(service: { id: string; title: string; category: string; userName?: string }): Promise<void> {
        if (!this.adminChatIds.length) return;
        const text =
            `🛠 <b>Yangi xizmat tasdiqlash kutmoqda</b>\n\n` +
            `📌 ${this.escapeHtml(service.category)}\n` +
            `📝 ${this.escapeHtml(service.title)}\n` +
            (service.userName ? `👤 ${this.escapeHtml(service.userName)}` : '');
        const extra = this.miniAppButton("📱 Mini App'da ko'rib chiqish", `/services/${service.id}`);
        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
            } catch (error) {
                this.logger.error(`❌ Failed to notify admin ${chatId} (new service): ${error.message}`);
            }
        }
    }

    async notifyUserServiceResult(telegramUserId: string, approved: boolean, service: { id: string; title: string }, reason?: string): Promise<void> {
        const text = approved
            ? `✅ <b>Xizmatingiz katalogga qo'shildi!</b>\n\n🛠 ${this.escapeHtml(service.title)}`
            : `❌ <b>Xizmatingiz rad etildi</b>\n\n🛠 ${this.escapeHtml(service.title)}` + (reason ? `\n📝 Sabab: ${this.escapeHtml(reason)}` : '');
        await this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.LISTINGS,
            title: approved ? `Xizmatingiz tasdiqlandi: ${service.title}` : `Xizmatingiz rad etildi: ${service.title}`,
            html: text,
            link: approved ? `/services/${service.id}` : '/my-listings',
        });
    }

    // ---------- Shikoyat ----------

    async notifyAdminReport(report: { listingId: string; listingTitle: string; reason: string; comment?: string | null; reporterName: string }): Promise<void> {
        if (!this.adminChatIds.length) return;
        const text =
            `🚩 <b>Yangi shikoyat</b>\n\n` +
            `🐴 ${this.escapeHtml(report.listingTitle)}\n` +
            `📌 Sabab: ${this.escapeHtml(report.reason)}\n` +
            (report.comment ? `📝 ${this.escapeHtml(report.comment)}\n` : '') +
            `👤 ${this.escapeHtml(report.reporterName)}`;
        const extra = this.miniAppButton("📱 E'lonni ko'rish", `/listings/${report.listingId}`);
        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
            } catch (error) {
                this.logger.error(`❌ Failed to notify admin ${chatId} (report): ${error.message}`);
            }
        }
    }

    // ---------- Sharh ----------

    async notifyNewReview(sellerTelegramId: string, sellerId: string, stars: number, reviewerName: string, comment?: string | null): Promise<void> {
        const text =
            `⭐ <b>Sizga yangi baho qoldirildi</b>\n\n` +
            `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n` +
            `👤 ${this.escapeHtml(reviewerName)}` +
            (comment ? `\n\n“${this.escapeHtml(comment)}”` : '');
        await this.notifications.deliver({
            telegramUserId: sellerTelegramId,
            category: NotificationCategory.OFFERS,
            title: `Sizga yangi baho: ${'★'.repeat(stars)}`,
            html: text,
            link: `/sellers/${sellerId}`,
            buttonText: '📱 Javob yozish',
        });
    }

    async notifyUserPromoted(telegramUserId: string, listing: { id: string; title: string }, packageName: string, days: number): Promise<void> {
        const text =
            `🚀 <b>E'loningiz reklama qilindi!</b>\n\n` +
            `🐴 ${this.escapeHtml(listing.title)}\n` +
            `📦 ${this.escapeHtml(packageName)}${days ? ` — ${days} kun` : ''}\n\n` +
            `E'loningiz ro'yxat tepasida ko'rsatiladi.`;
        await this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.LISTINGS,
            title: `E'loningiz reklama qilindi: ${packageName}`,
            html: text,
            link: `/listings/${listing.id}`,
            buttonText: "📱 E'lonni ochish",
        });
    }

    async notifyUserListingResult(
        telegramUserId: string,
        action: 'approved' | 'rejected',
        listing: { id: string; title: string },
        rejectReason?: string,
    ): Promise<void> {
        const text = action === 'approved'
            ? `✅ <b>E'loningiz tasdiqlandi!</b>\n\n🐴 ${this.escapeHtml(listing.title)}\n\nE'loningiz bozorda ko'rinmoqda.`
            : `❌ <b>E'loningiz rad etildi</b>\n\n🐴 ${this.escapeHtml(listing.title)}` +
            (rejectReason ? `\n\n📝 Sabab: ${this.escapeHtml(rejectReason)}` : '') +
            `\n\nTahrirlab, qayta yuborishingiz mumkin.`;
        await this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.LISTINGS,
            title: action === 'approved' ? `E'loningiz tasdiqlandi: ${listing.title}` : `E'loningiz rad etildi: ${listing.title}`,
            html: text,
            link: action === 'approved' ? `/listings/${listing.id}` : '/my-listings',
        });
    }

    async notifyUserProductResult(
        telegramUserId: string,
        product: { id: string; title: string; slug?: string },
    ): Promise<void> {
        await this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.LISTINGS,
            title: `Mahsulotingiz tasdiqlandi: ${product.title}`,
            html: `✅ <b>Mahsulotingiz tasdiqlandi!</b>\n\n📦 ${this.escapeHtml(product.title)}\n\nMahsulot do'konda ko'rinmoqda.`,
            link: product.slug ? `/products/${product.slug}` : '/my-listings',
        });
    }

    async notifyUserListingExpired(
        telegramUserId: string,
        listing: { id: string; title: string },
    ): Promise<void> {
        await this.notifications.deliver({
            telegramUserId,
            category: NotificationCategory.LISTINGS,
            title: `E'lon muddati tugadi: ${listing.title}`,
            html: `⏰ <b>E'loningiz muddati tugadi!</b>\n\n🐴 ${this.escapeHtml(listing.title)}\n\nMini App'da qayta faollashtirishingiz mumkin.`,
            link: '/my-listings',
            buttonText: '🔄 Qayta faollashtirish',
        });
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private getBreedEmoji(breed: string): string {
        const breedLower = breed.toLowerCase();
        if (breedLower.includes('karabayir') || breedLower.includes('qorabayir')) return '🐎';
        if (breedLower.includes('arab')) return '🏇';
        if (breedLower.includes('axaltekin') || breedLower.includes('ahal')) return '🦄';
        if (breedLower.includes('lokai') || breedLower.includes('loqay')) return '🐴';
        if (breedLower.includes('yomud') || breedLower.includes('iomud')) return '🏇';
        return '🐴';
    }

    private getAgeEmoji(ageYears: number | null): string {
        return '⚡';
    }

    /** Adminlarga umumiy xabar (Mini App tugmasi bilan) */
    async notifyAdmins(html: string, path?: string, buttonText = "📱 Mini App'da ochish"): Promise<void> {
        const extra = path ? this.miniAppButton(buttonText, path) : {};
        for (const chatId of this.adminChatIds) {
            await this.bot.telegram.sendMessage(chatId, html, { parse_mode: 'HTML', ...extra }).catch((e) => this.logger.error(`Admin notify failed: ${e.message}`));
        }
    }



    async postBlogToChannel(post: {
        id: string;
        slug: string;
        title: string;
        excerpt?: string;
        coverImage?: string;
    }): Promise<void> {
        const channel = await this.activeChannel(`blog ${post.id}`);
        if (!channel) return;

        try {
            const link = `${this.frontendUrl}/blog/${post.slug}`;

            let caption = `#foydali_maqola\n`;
            caption += `<b>${this.escapeHtml(post.title)}</b>\n\n`;

            if (post.excerpt) {
                caption += `${this.escapeHtml(post.excerpt)}\n\n`;
            }

            caption += `<a href="${link}">Maqolani o'qish →</a>\n\n`;
            caption += `<b>Otbozor.uz — ot savdosi uchun maxsus yaratilgan platforma.</b>\n\n`;
            caption += `<a href="${channel.url}">Telegram kanal</a> | `;
            caption += `<a href="https://t.me/otbozor_rasmiy_guruh">Telegram guruh</a> | `;
            caption += `<a href="https://instagram.com/otbozor.uz">Instagram</a>`;

            if (post.coverImage) {
                await this.bot.telegram.sendPhoto(channel.chatId, post.coverImage, {
                    caption,
                    parse_mode: 'HTML',
                });
            } else {
                await this.bot.telegram.sendMessage(channel.chatId, caption, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: false },
                });
            }

            this.logger.log(`✅ Blog post posted to Telegram channel: ${post.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post blog to Telegram channel: ${error.message}`);
        }
    }
}
