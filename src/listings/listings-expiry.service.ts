import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';

@Injectable()
export class ListingsExpiryService {
    private readonly logger = new Logger(ListingsExpiryService.name);
    private readonly BATCH_SIZE = 100;
    private readonly NOTIFY_CHUNK = 25;

    constructor(
        private prisma: PrismaService,
        private telegramChannel: TelegramChannelService,
    ) {}

    // Har kecha soat 00:00 da ishlaydi
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async expireListings() {
        try {
            const now = new Date();

            // 1. Muddati tugagan e'lonlarni batch-batch qilib qayta ishlaymiz
            let totalExpired = 0;
            let cursor: string | undefined;

            while (true) {
                const batch = await this.prisma.horseListing.findMany({
                    where: {
                        status: 'APPROVED',
                        expiresAt: { lt: now },
                    },
                    select: {
                        id: true,
                        title: true,
                        user: { select: { telegramUserId: true } },
                    },
                    take: this.BATCH_SIZE,
                    ...(cursor && { skip: 1, cursor: { id: cursor } }),
                    orderBy: { id: 'asc' },
                });

                if (batch.length === 0) break;

                const ids = batch.map(l => l.id);

                await this.prisma.horseListing.updateMany({
                    where: { id: { in: ids } },
                    data: { status: 'EXPIRED' },
                });

                totalExpired += batch.length;

                // Telegram xabarlarni 25 tadan chunk qilib yuboramiz (rate limit uchun)
                const toNotify = batch.filter(l => l.user?.telegramUserId);
                for (let i = 0; i < toNotify.length; i += this.NOTIFY_CHUNK) {
                    const chunk = toNotify.slice(i, i + this.NOTIFY_CHUNK);
                    await Promise.allSettled(
                        chunk.map(l => this.telegramChannel.notifyUserListingExpired(
                            l.user.telegramUserId.toString(),
                            { id: l.id, title: l.title },
                        ))
                    );
                    if (i + this.NOTIFY_CHUNK < toNotify.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                if (batch.length < this.BATCH_SIZE) break;
                cursor = batch[batch.length - 1].id;
            }

            if (totalExpired > 0) {
                this.logger.log(`⏰ ${totalExpired} ta e'lon muddati tugadi (EXPIRED)`);
            }

            // 2. Boost muddati tugasa → isPaid va isTop ni reset qilish
            const boostResult = await this.prisma.horseListing.updateMany({
                where: {
                    isPaid: true,
                    boostExpiresAt: { lt: now },
                },
                data: { isPaid: false, isTop: false, isPremium: false, boostExpiresAt: null },
            });
            if (boostResult.count > 0) {
                this.logger.log(`📦 ${boostResult.count} ta e'lon reklamasi muddati tugadi`);
            }
        } catch (err) {
            this.logger.error('expireListings error:', err);
        }
    }
}
