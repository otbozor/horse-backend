import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

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

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly configService: ConfigService,
    ) {
        this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID') || '';
        const raw = this.configService.get<string>('TELEGRAM_ADMIN_CHAT_IDS') || '';
        this.adminChatIds = raw.split(',').map(s => s.trim()).filter(Boolean);
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
    }

    // ─── Kanalga e'lon yuborish (boost to'lovi) ─────────────────────────────

    async postListingToChannel(listing: ListingForChannel): Promise<void> {
        if (!this.channelId) {
            this.logger.warn('TELEGRAM_CHANNEL_ID not set — skipping channel post');
            return;
        }

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

            // Zot va yosh uchun emoji
            const breedEmoji = this.getBreedEmoji(breed);
            const ageEmoji = this.getAgeEmoji(listing.ageYears);

            // Xabar matni
            let caption = `<b>${this.escapeHtml(listing.title)}</b>\n\n`;

            if (price) caption += `<b>💰 Narxi:</b> ${price}\n`;
            if (region) caption += `<b>📍 Joylashuvi:</b> ${this.escapeHtml(region)}${district ? ', ' + this.escapeHtml(district) : ''}\n`;
            if (breed) caption += `<b>${breedEmoji} Zoti:</b> ${this.escapeHtml(breed)}\n`;
            if (age) caption += `<b>${ageEmoji} Yoshi:</b> ${age}\n`;

            caption += `\n<b><a href="${link}">Bog'lanish va batafsil ma'lumot</a></b>\n\n`;
            caption += `Otbozor.uz — ot savdosi uchun maxsus yaratilgan platforma.\n\n`;
            caption += `<b><a href="https://t.me/otbozor_rasmiy">Telegram kanal</a></b> | `;
            caption += `<b><a href="https://t.me/otbozor_rasmiy_guruh">Telegram guruh</a></b> | `;
            caption += `<b><a href="https://instagram.com/otbozor.uz">Instagram</a></b>\n\n`;
            caption += `#otbozor #ot #yilqi`;

            const photoUrl = listing.media?.[0]?.url;

            if (photoUrl) {
                await this.bot.telegram.sendPhoto(this.channelId, photoUrl, {
                    caption,
                    parse_mode: 'HTML',
                });
            } else {
                await this.bot.telegram.sendMessage(this.channelId, caption, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: false },
                });
            }

            this.logger.log(`✅ Listing posted to Telegram channel: ${listing.id}`);
        } catch (error) {
            this.logger.error(`❌ Failed to post listing to Telegram channel: ${error.message}`);
        }
    }

    // ─── Adminga yangi ot e'loni keldi ───────────────────────────────────────

    async notifyAdminNewListing(listing: { id: string; title: string; userId: string; userName?: string }): Promise<void> {
        if (!this.adminChatIds.length) return;
        const adminLink = `${this.frontendUrl}/admin/listings/${listing.id}/preview`;
        const text =
            `🔔 <b>Yangi ot e'loni tasdiqlash kutmoqda</b>\n\n` +
            `🐴 ${this.escapeHtml(listing.title)}\n` +
            (listing.userName ? `👤 ${this.escapeHtml(listing.userName)}\n` : '') +
            `\n<a href="${adminLink}">Admin panelda ko'rish →</a>`;

        for (const chatId of this.adminChatIds) {
            try {
                await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
            } catch (error) {
                this.logger.error(`❌ Failed to notify admin ${chatId} (new listing): ${error.message}`);
            }
        }
    }

    // ─── Adminga yangi mahsulot e'loni keldi ─────────────────────────────────

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

    // ─── Userage ot e'loni tasdiqlandi/rad etildi ────────────────────────────

    async notifyUserListingResult(
        telegramUserId: string,
        action: 'approved' | 'rejected',
        listing: { id: string; title: string },
        rejectReason?: string,
    ): Promise<void> {
        try {
            const myListingsLink = `${this.frontendUrl}/profil/elonlarim`;
            const text = action === 'approved'
                ? `✅ <b>E'loningiz tasdiqlandi!</b>\n\n` +
                `🐴 ${this.escapeHtml(listing.title)}\n\n` +
                `<a href="${myListingsLink}">Mening e'lonlarim →</a>`
                : `❌ <b>E'loningiz rad etildi</b>\n\n` +
                `🐴 ${this.escapeHtml(listing.title)}\n` +
                (rejectReason ? `\n📝 Sabab: ${this.escapeHtml(rejectReason)}\n` : '') +
                `\n<a href="${myListingsLink}">Mening e'lonlarim →</a>`;

            await this.bot.telegram.sendMessage(telegramUserId, text, { parse_mode: 'HTML' });
        } catch (error) {
            this.logger.error(`❌ Failed to notify user (listing ${action}): ${error.message}`);
        }
    }

    // ─── Userage mahsulot tasdiqlandi ────────────────────────────────────────

    async notifyUserProductResult(
        telegramUserId: string,
        product: { id: string; title: string; slug?: string },
    ): Promise<void> {
        try {
            const myListingsLink = `${this.frontendUrl}/profil/elonlarim`;
            const text =
                `✅ <b>Mahsulotingiz tasdiqlandi!</b>\n\n` +
                `📦 ${this.escapeHtml(product.title)}\n\n` +
                `<a href="${myListingsLink}">Mening e'lonlarim →</a>`;

            await this.bot.telegram.sendMessage(telegramUserId, text, { parse_mode: 'HTML' });
        } catch (error) {
            this.logger.error(`❌ Failed to notify user (product published): ${error.message}`);
        }
    }

    // ─── E'lon muddati tugadi bildirishnomasi ─────────────────────────────────

    async notifyUserListingExpired(
        telegramUserId: string,
        listing: { id: string; title: string },
    ): Promise<void> {
        try {
            const reactivateLink = `${this.frontendUrl}/elon/${listing.id}/nashr-tolov`;
            const text =
                `⏰ <b>E'loningiz muddati tugadi!</b>\n\n` +
                `🐴 ${this.escapeHtml(listing.title)}\n\n` +
                `E'lonni qayta faollashtirish uchun quyidagi havolani bosing:\n` +
                `<a href="${reactivateLink}">🔄 Faollashtirish →</a>`;

            await this.bot.telegram.sendMessage(telegramUserId, text, { parse_mode: 'HTML' });
        } catch (error) {
            this.logger.error(`❌ Failed to notify user (listing expired): ${error.message}`);
        }
    }

    // ─── Yordamchi ───────────────────────────────────────────────────────────

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ─── Zot uchun emoji ─────────────────────────────────────────────────────

    private getBreedEmoji(breed: string): string {
        const breedLower = breed.toLowerCase();
        if (breedLower.includes('karabayir') || breedLower.includes('qorabayir')) return '🐎';
        if (breedLower.includes('arab')) return '🏇';
        if (breedLower.includes('axaltekin') || breedLower.includes('ahal')) return '🦄';
        if (breedLower.includes('lokai') || breedLower.includes('loqay')) return '🐴';
        if (breedLower.includes('yomud') || breedLower.includes('iomud')) return '🏇';
        return '🐴'; // default
    }

    // ─── Yosh uchun emoji ────────────────────────────────────────────────────

    private getAgeEmoji(ageYears: number | null): string {
        return '⚡';
    }
}
