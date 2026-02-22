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
    private readonly frontendUrl: string;

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly configService: ConfigService,
    ) {
        this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID') || '';
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
    }

    async postListingToChannel(listing: ListingForChannel): Promise<void> {
        if (!this.channelId) {
            this.logger.warn('TELEGRAM_CHANNEL_ID not set — skipping channel post');
            return;
        }

        try {
            const priceNum = listing.priceAmount ? Number(listing.priceAmount.toString()) : null;
            const price = priceNum
                ? `${priceNum.toLocaleString('uz-UZ')} ${listing.priceCurrency || 'UZS'}`
                : "Narx ko'rsatilmagan";

            const region = listing.region?.nameUz || '';
            const district = listing.district?.nameUz ? `, ${listing.district.nameUz}` : '';
            const breed = listing.breed?.name || '';
            const age = listing.ageYears ? `${listing.ageYears} yosh` : '';
            const badge = listing.isPremium ? '👑 Premium' : '⭐️ Top';
            const link = `${this.frontendUrl}/ot/${listing.id}-${listing.slug}`;

            const details = [age, breed].filter(Boolean).join(' | ');
            const phone = listing.user?.phone || '';

            const caption =
                `${badge}\n\n` +
                `🐴 <b>${this.escapeHtml(listing.title)}</b>\n\n` +
                `💰 ${price}\n` +
                `📍 ${this.escapeHtml(region + district)}\n` +
                (details ? `🔎 ${this.escapeHtml(details)}\n` : '') +
                (phone ? `📞 ${phone}\n` : '') +
                `\n<a href="${link}">Saytda ko'rish →</a>`;

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
            // Don't throw — channel post failure should not affect payment completion
            this.logger.error(`❌ Failed to post listing to Telegram channel: ${error.message}`);
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
