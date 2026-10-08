import { createHash } from 'crypto';
import { Request } from 'express';
import { verify } from 'jsonwebtoken';

/** Public endpointlarda ixtiyoriy Bearer token'dan foydalanuvchi ID'si (guard'siz) */
export function optionalUserId(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ') || !process.env.JWT_SECRET) return undefined;
    try {
        const payload = verify(header.slice(7), process.env.JWT_SECRET) as { sub?: string };
        return payload.sub;
    } catch {
        return undefined;
    }
}

/** Anonim ko'ruvchi kaliti: cookie sessiyasi bo'lmasa IP + brauzer bo'yicha */
export function anonViewerKey(req: Request): string {
    const cookie = req.cookies?.sessionId as string | undefined;
    if (cookie) return cookie;
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = forwarded || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    return 'anon:' + createHash('sha1').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/** Bir xil ko'rishni qayta sanamaslik uchun xotiradagi oyna (standart 24 soat) */
export class ViewDedupe {
    private readonly seen = new Map<string, number>();

    constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) { }

    /** true — bu ko'rish yangi, sanash kerak */
    hit(key: string): boolean {
        const now = Date.now();
        const last = this.seen.get(key);
        if (last && now - last < this.ttlMs) return false;
        this.seen.set(key, now);
        if (this.seen.size > 50_000) {
            for (const [k, ts] of this.seen) if (now - ts >= this.ttlMs) this.seen.delete(k);
        }
        return true;
    }
}
