import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';

interface ServiceAccount {
    project_id: string;
    client_email: string;
    private_key: string;
}

export interface PushMessage {
    title: string;
    body?: string | null;
    /** Mini App ichidagi yo'l — bildirishnoma bosilganda ochiladi */
    link?: string | null;
}

/** Android'da yaratiladigan kanal (miniapp/src/push.ts bilan bir xil) */
const ANDROID_CHANNEL = 'otbozor';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Android ilova push-bildirishnomalari — Firebase Cloud Messaging HTTP v1.
 * Kalit: serverdagi deploy/secrets/firebase-service-account.json (backend'ga faqat o'qish uchun ulanadi).
 * Kalit yo'q bo'lsa — push o'chiq, qolgan hammasi (Telegram xabarlari, 🔔 ro'yxat) ishlayveradi.
 */
@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);
    private account: ServiceAccount | null | undefined;
    private token: { value: string; exp: number } | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) { }

    private get serviceAccount(): ServiceAccount | null {
        if (this.account !== undefined) return this.account;
        const file = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_FILE') || '/app/secrets/firebase-service-account.json';
        try {
            const json = JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
            this.account = json.project_id && json.client_email && json.private_key ? json : null;
        } catch {
            this.account = null;
        }
        if (this.account) this.logger.log(`Push yoqilgan (Firebase: ${this.account.project_id})`);
        return this.account;
    }

    get enabled() {
        return Boolean(this.serviceAccount);
    }

    /** Google OAuth token (service account JWT → access token, ~1 soat) */
    private async accessToken(sa: ServiceAccount): Promise<string> {
        if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
        const now = Math.floor(Date.now() / 1000);
        const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const claims = b64url(
            JSON.stringify({
                iss: sa.client_email,
                scope: 'https://www.googleapis.com/auth/firebase.messaging',
                aud: 'https://oauth2.googleapis.com/token',
                iat: now,
                exp: now + 3600,
            }),
        );
        const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }),
            signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
        if (!json.access_token) throw new Error(`Google OAuth: ${json.error ?? res.status}`);
        this.token = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
        return json.access_token;
    }

    async register(userId: string, token: string, platform = 'android') {
        await this.prisma.pushDevice.upsert({
            where: { token },
            create: { token, userId, platform },
            update: { userId, platform, lastSeenAt: new Date() },
        });
    }

    async unregister(token: string) {
        await this.prisma.pushDevice.deleteMany({ where: { token } });
    }

    /** Foydalanuvchining barcha qurilmalariga; yaroqsiz tokenlar o'chiriladi */
    async sendToUser(userId: string, msg: PushMessage): Promise<number> {
        const sa = this.serviceAccount;
        if (!sa) return 0;
        const devices = await this.prisma.pushDevice.findMany({ where: { userId }, select: { token: true } });
        if (!devices.length) return 0;
        let sent = 0;
        try {
            const access = await this.accessToken(sa);
            for (const d of devices) {
                const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: {
                            token: d.token,
                            notification: { title: msg.title.slice(0, 120), body: (msg.body ?? '').slice(0, 300) },
                            data: { link: msg.link ?? '' },
                            android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL, sound: 'default' } },
                        },
                    }),
                    signal: AbortSignal.timeout(10_000),
                });
                if (res.ok) {
                    sent++;
                    continue;
                }
                const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } };
                const code = err.error?.details?.find((x) => x.errorCode)?.errorCode ?? err.error?.status;
                if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || res.status === 404) await this.unregister(d.token);
                else this.logger.warn(`Push failed (${res.status} ${code}): ${err.error?.message ?? ''}`);
            }
        } catch (e) {
            this.logger.warn(`Push: ${(e as Error).message}`);
        }
        return sent;
    }
}
