import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from './telegram-channel.service';

class ChannelSettingsDto {
    @IsOptional() @IsBoolean()
    enabled?: boolean;

    /** @username, t.me/username havolasi yoki -100... chat ID */
    @IsOptional() @IsString() @MaxLength(200)
    channel?: string;
}

const ok = <T>(data: T) => ({ success: true, data, timestamp: new Date().toISOString() });

/** "https://t.me/otbozor", "t.me/otbozor", "otbozor", "@otbozor", "-100123" → "@otbozor" / "-100123" */
function normalizeChannel(raw: string): string {
    let v = raw.trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?(t|telegram)\.me\//i, '').replace(/\/.*$/, '');
    if (/^-?\d+$/.test(v)) return v;
    v = v.replace(/^@/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) {
        throw new BadRequestException("Kanal manzili noto'g'ri. Masalan: @otbozor_rasmiy yoki https://t.me/otbozor_rasmiy");
    }
    return `@${v}`;
}

@ApiTags('Channel settings')
@Controller()
export class ChannelSettingsController {
    constructor(
        private readonly channel: TelegramChannelService,
        private readonly prisma: PrismaService,
        @InjectBot() private readonly bot: Telegraf,
    ) { }

    /** Mini app'dagi "Telegram kanal" havolasi uchun */
    @Get('settings/channel')
    async publicChannel() {
        const cfg = await this.channel.getChannelConfig();
        return ok({ url: cfg.url });
    }

    @Get('admin/channel-settings')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async get() {
        const cfg = await this.channel.getChannelConfig();
        const title = await this.chatTitle(cfg.chatId);
        return ok({ ...cfg, title });
    }

    @Put('admin/channel-settings')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async update(@Body() dto: ChannelSettingsDto) {
        const upsert = (key: string, value: string) =>
            this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
        if (dto.channel !== undefined) {
            const chatId = normalizeChannel(dto.channel);
            await this.assertBotCanPost(chatId);
            await upsert('channel_chat_id', chatId);
        }
        if (dto.enabled !== undefined) await upsert('channel_enabled', String(dto.enabled));
        return this.get();
    }

    /** Kanalga sinov xabari (o'chirilgan holatda ham ishlaydi) */
    @Post('admin/channel-settings/test')
    @UseGuards(JwtAuthGuard, AdminGuard)
    @ApiBearerAuth()
    async test() {
        const cfg = await this.channel.getChannelConfig();
        if (!cfg.chatId) throw new BadRequestException('Kanal sozlanmagan');
        try {
            await this.bot.telegram.sendMessage(cfg.chatId, '✅ Otbozor bot: kanalga ulanish tekshiruvi');
        } catch (e) {
            throw new BadRequestException(`Kanalga yuborib bo'lmadi: ${(e as Error).message}`);
        }
        return ok({ sent: true });
    }

    private async chatTitle(chatId: string): Promise<string | null> {
        if (!chatId) return null;
        try {
            const chat = await this.bot.telegram.getChat(chatId);
            return 'title' in chat ? chat.title : null;
        } catch {
            return null;
        }
    }

    private async assertBotCanPost(chatId: string) {
        try {
            const me = await this.bot.telegram.getMe();
            const member = await this.bot.telegram.getChatMember(chatId, me.id);
            const canPost = member.status === 'creator' || (member.status === 'administrator' && member.can_post_messages !== false);
            if (!canPost) throw new Error('not admin');
        } catch {
            throw new BadRequestException(
                "Bot bu kanalga post joylay olmaydi. Botni kanalga administrator qilib qo'shing (\"Xabar joylash\" huquqi bilan) va qayta urinib ko'ring",
            );
        }
    }
}
