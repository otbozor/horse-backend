/**
 * DigitalOcean API (faqat o'qish): droplet tarifi va Monitoring metrikalari.
 * Token: DO_API_TOKEN (Read scope yetarli). Bo'lmasa — bu qism o'chiq, qolgan statistika ishlayveradi.
 */
const API = 'https://api.digitalocean.com/v2';

type Matrix = { metric: Record<string, string>; values: [number, string][] }[];

export interface DoDroplet {
    name: string;
    region: string;
    sizeSlug: string;
    vcpus: number;
    memoryMb: number;
    diskGb: number;
    priceMonthly: number;
    createdAt: string;
    backupsEnabled: boolean;
}

export interface DoSeries {
    /** [unix sec, qiymat] */
    cpu: [number, number][];
    memory: [number, number][];
    bandwidthIn: [number, number][];
    bandwidthOut: [number, number][];
}

export class DoClient {
    constructor(private readonly token: string, private readonly dropletId: string) { }

    private async get<T>(path: string): Promise<T> {
        const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${this.token}` },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`DigitalOcean API ${res.status}`);
        return (await res.json()) as T;
    }

    async droplet(): Promise<DoDroplet> {
        const { droplet: d } = await this.get<{ droplet: any }>(`/droplets/${this.dropletId}`);
        return {
            name: d.name,
            region: d.region?.slug,
            sizeSlug: d.size_slug,
            vcpus: d.vcpus,
            memoryMb: d.memory,
            diskGb: d.disk,
            priceMonthly: d.size?.price_monthly ?? 0,
            createdAt: d.created_at,
            backupsEnabled: (d.features ?? []).includes('backups'),
        };
    }

    private async metric(name: string, start: number, end: number, extra = ''): Promise<Matrix> {
        const r = await this.get<{ data: { result: Matrix } }>(
            `/monitoring/metrics/droplet/${name}?host_id=${this.dropletId}&start=${start}&end=${end}${extra}`,
        );
        return r.data?.result ?? [];
    }

    async series(hours: number): Promise<DoSeries> {
        const end = Math.floor(Date.now() / 1000);
        const start = end - hours * 3600;
        const [cpu, memTotal, memAvail, bwIn, bwOut] = await Promise.all([
            this.metric('cpu', start, end),
            this.metric('memory_total', start, end),
            this.metric('memory_available', start, end),
            this.metric('bandwidth', start, end, '&interface=public&direction=inbound'),
            this.metric('bandwidth', start, end, '&interface=public&direction=outbound'),
        ]);
        return {
            cpu: cpuUsage(cpu),
            memory: ratio(memTotal, memAvail),
            bandwidthIn: values(bwIn),
            bandwidthOut: values(bwOut),
        };
    }
}

const values = (m: Matrix): [number, number][] => (m[0]?.values ?? []).map(([t, v]) => [t, Number(v)]);

/** CPU: har rejim (idle, user, system...) bo'yicha jamlangan soniyalar → band % */
function cpuUsage(m: Matrix): [number, number][] {
    if (!m.length) return [];
    const byTs = new Map<number, { idle: number; total: number }>();
    for (const s of m) {
        const isIdle = s.metric.mode === 'idle' || s.metric.mode === 'iowait';
        for (const [t, v] of s.values) {
            const e = byTs.get(t) ?? { idle: 0, total: 0 };
            e.total += Number(v);
            if (isIdle) e.idle += Number(v);
            byTs.set(t, e);
        }
    }
    const pts = [...byTs.entries()].sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
        const dt = pts[i][1].total - pts[i - 1][1].total;
        const di = pts[i][1].idle - pts[i - 1][1].idle;
        if (dt > 0) out.push([pts[i][0], Math.max(0, Math.min(100, (1 - di / dt) * 100))]);
    }
    return out;
}

/** Xotira: 1 - available/total, % */
function ratio(total: Matrix, avail: Matrix): [number, number][] {
    const t = new Map(values(total));
    return values(avail)
        .filter(([ts]) => t.get(ts))
        .map(([ts, a]) => [ts, Math.max(0, Math.min(100, (1 - a / (t.get(ts) as number)) * 100))]);
}
