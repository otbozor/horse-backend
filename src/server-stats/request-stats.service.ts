import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const MAX_SAMPLES = 5000;

interface RouteAgg {
    count: number;
    totalMs: number;
    maxMs: number;
    errors: number;
}

export interface RequestWindow {
    startedAt: number;
    count: number;
    errors5xx: number;
    durations: number[];
    routes: Map<string, RouteAgg>;
}

export interface RouteStat {
    route: string;
    count: number;
    avgMs: number;
    maxMs: number;
    errors: number;
}

const newWindow = (): RequestWindow => ({ startedAt: Date.now(), count: 0, errors5xx: 0, durations: [], routes: new Map() });

export const percentile = (sorted: number[], p: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

/** API so'rovlari: soni, javob vaqti, 5xx xatolar va eng sekin yo'llar (xotirada, 5 daqiqalik oynalar) */
@Injectable()
export class RequestStatsService {
    private current = newWindow();
    private seen = 0;
    /** Oxirgi yopilgan oyna — "hozir" ko'rinishi uchun */
    lastRoutes: RouteStat[] = [];

    record(route: string, ms: number, status: number) {
        const w = this.current;
        w.count++;
        if (status >= 500) w.errors5xx++;
        // Reservoir sampling — juda ko'p so'rovda ham xotira cheklangan
        this.seen++;
        if (w.durations.length < MAX_SAMPLES) w.durations.push(ms);
        else {
            const j = Math.floor(Math.random() * this.seen);
            if (j < MAX_SAMPLES) w.durations[j] = ms;
        }
        const r = w.routes.get(route) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
        r.count++;
        r.totalMs += ms;
        r.maxMs = Math.max(r.maxMs, ms);
        if (status >= 500) r.errors++;
        w.routes.set(route, r);
    }

    /** Joriy oynani yopib, natijasini qaytaradi */
    drain() {
        const w = this.current;
        this.current = newWindow();
        this.seen = 0;
        const sorted = [...w.durations].sort((a, b) => a - b);
        const routes = [...w.routes.entries()]
            .map(([route, r]) => ({ route, count: r.count, avgMs: Math.round(r.totalMs / r.count), maxMs: Math.round(r.maxMs), errors: r.errors }))
            .sort((a, b) => b.avgMs * b.count - a.avgMs * a.count);
        this.lastRoutes = routes.slice(0, 15);
        return {
            minutes: Math.max(1, (Date.now() - w.startedAt) / 60_000),
            requests: w.count,
            errors5xx: w.errors5xx,
            avgMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
            p95Ms: Math.round(percentile(sorted, 95)),
        };
    }
}

@Injectable()
export class RequestStatsMiddleware implements NestMiddleware {
    constructor(private readonly stats: RequestStatsService) { }

    use(req: Request, res: Response, next: NextFunction) {
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            const path = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'boshqa';
            this.stats.record(`${req.method} ${path}`, ms, res.statusCode);
        });
        next();
    }
}
