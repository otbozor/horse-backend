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

    async postListingToChannel(listing: ListingForChannel): Promise<void> {
        const channel = await this.activeChannel(`listing ${listing.id}`);
        if (!channel) return;

        try {
            const priceNum = listing.priceAmount ? Number(listing.priceAmount.toString()) : null;
            const currency = listing.priceCurrency || 'UZS';
            const price = priceNum
                ? currency === 'USD'
                    ? `$${priceNum.toLocaleString('en-US')}`
                    : `${priceNum.toLocaleString('uz-UZ')} so'm`
                : "Narx ko'rsatilmagan";

            const region = listing.region?.nameUz || '';
            const district = listing.district?.nameUz || '';
            const breed = listing.breed?.name || '';
            const age = listing.ageYears ? `${listing.ageYears} yosh` : '';
            const link = `${this.frontendUrl}/ot/${listing.id}-${listing.slug}`;

            const breedEmoji = this.getBreedEmoji(breed);
            const ageEmoji = this.getAgeEmoji(listing.ageYears);

            let caption = `<b>${this.escapeHtml(listing.title)}</b>\n\n`;

            if (price) caption += `<b>💰 Narxi:</b> ${price}\n`;
            if (region) caption += `<b>📍 Joylashuvi:</b> ${this.escapeHtml(region)}${district ? ', ' + this.escapeHtml(district) : ''}\n`;
            if (breed) caption += `<b>${breedEmoji} Zoti:</b> ${this.escapeHtml(breed)}\n`;
            if (age) caption += `<b>${ageEmoji} Yoshi:</b> ${age}\n`;

            caption += `\nOtbozor.uz — ot savdosi uchun maxsus yaratilgan platforma.\n\n`;
            caption += `<b><a href="${channel.url}">Telegram kanal</a></b> | `;
            caption += `<b><a href="https://t.me/otbozor_rasmiy_guruh">Telegram guruh</a></b> | `;
            caption += `<b><a href="https://instagram.com/otbozor.uz">Instagram</a></b>`;

            const images = listing.media?.filter(m => m.url) || [];

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "To'liq ma'lumot", url: link },
                        { text: "E'lon joylash", url: `${this.frontendUrl}/elon/yaratish` }
                    ],
                    [
                        { text: "Barcha e'lonlar", url: `${this.frontendUrl}/bozor` },
                        { text: "Admin", url: `https://t.me/${this.adminUsername.replace('@', '')}` }
                    ],
                ],
            };

            if (images.length === 0) {
                await this.bot.telegram.sendMessage(channel.chatId, caption, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: false },
                    reply_markup: keyboard,
                });
            } else {
                // Faqat birinchi rasmni yuborish (buttonlar bilan)
                await this.bot.telegram.sendPhoto(channel.chatId, images[0].url, {
                    caption,
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                });
            }

            this.logger.log(`✅ Listing posted to Telegram channel: ${listing.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post listing to Telegram channel: ${error.message}`);
        }
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

    /** Kanalga: "Kim oshdi savdosi boshlandi" — Mini App'dagi auksionga tugma bilan */
    async postAuctionToChannel(
        listing: { id: string; title: string; ageYears: number | null; region?: { nameUz: string } | null; breed?: { name: string } | null; media?: { url: string }[] },
        auction: { startPrice: number; minStep: number; currency: string; endsAt: Date },
    ): Promise<void> {
        const channel = await this.activeChannel(`auction ${listing.id}`);
        if (!channel) return;
        const money = (n: number) => (auction.currency === 'USD' ? `$${n.toLocaleString('en-US')}` : `${n.toLocaleString('uz-UZ')} so'm`);
        const l = new Date(auction.endsAt.getTime() + 5 * 3600000);
        const ends = `${String(l.getUTCDate()).padStart(2, '0')}.${String(l.getUTCMonth() + 1).padStart(2, '0')} soat ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`;
        const caption =
            `🔨 <b>KIM OSHDI SAVDOSI!</b>\n\n` +
            `<b>${this.escapeHtml(listing.title)}</b>\n` +
            (listing.breed ? `🐴 Zoti: ${this.escapeHtml(listing.breed.name)}\n` : '') +
            (listing.ageYears != null ? `📅 Yoshi: ${listing.ageYears} yosh\n` : '') +
            (listing.region ? `📍 ${this.escapeHtml(listing.region.nameUz)}\n` : '') +
            `\n💰 Boshlang'ich narx: <b>${money(auction.startPrice)}</b>\n` +
            `➕ Qadam: ${money(auction.minStep)}\n` +
            `⏳ Tugaydi: <b>${ends}</b>\n\n` +
            `Eng yuqori narxni taklif qilgan xaridor yutadi!`;
        const botUsername = (this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'otbozor_bot').replace(/^@/, '');
        const link = `https://t.me/${botUsername}/app?startapp=l_${listing.id}`;
        const reply_markup = { inline_keyboard: [[{ text: '🔨 Auksionda qatnashish', url: link }]] };
        try {
            const photo = listing.media?.[0]?.url;
            if (photo) await this.bot.telegram.sendPhoto(channel.chatId, photo, { caption, parse_mode: 'HTML', reply_markup });
            else await this.bot.telegram.sendMessage(channel.chatId, caption, { parse_mode: 'HTML', reply_markup });
            this.logger.log(`✅ Auction posted to channel: ${listing.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post auction to channel: ${error.message}`);
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
