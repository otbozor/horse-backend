import { createHmac, timingSafeEqual } from 'crypto';

export interface TelegramWebAppUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    language_code?: string;
}

export interface ParsedInitData {
    user: TelegramWebAppUser;
    authDate: number;
    startParam?: string;
}

/**
 * Telegram Mini App initData imzosini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Imzo noto'g'ri yoki muddati o'tgan bo'lsa null qaytaradi.
 */
export function verifyTelegramInitData(
    initData: string,
    botToken: string,
    maxAgeSeconds = 24 * 60 * 60,
): ParsedInitData | null {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const authDate = Number(params.get('auth_date') ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;

    try {
        const user = JSON.parse(userRaw) as TelegramWebAppUser;
        if (!user?.id) return null;
        return { user, authDate, startParam: params.get('start_param') ?? undefined };
    } catch {
        return null;
    }
}
