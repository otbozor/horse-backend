import { readFile, statfs } from 'node:fs/promises';

/**
 * Host (droplet) ko'rsatkichlari. Konteyner ichidagi /proc host bilan umumiy (lxcfs yo'q):
 * /proc/stat, /proc/meminfo, /proc/loadavg butun serverni ko'rsatadi; statfs('/') — server diski.
 */
export interface CpuTimes {
    idle: number;
    total: number;
}

export async function readCpuTimes(): Promise<CpuTimes | null> {
    try {
        const line = (await readFile('/proc/stat', 'utf8')).split('\n')[0];
        const parts = line.trim().split(/\s+/).slice(1).map(Number);
        const idle = (parts[3] ?? 0) + (parts[4] ?? 0); // idle + iowait
        const total = parts.slice(0, 8).reduce((a, b) => a + b, 0); // guest'larsiz
        return { idle, total };
    } catch {
        return null;
    }
}

export const cpuPercent = (a: CpuTimes | null, b: CpuTimes | null) => {
    if (!a || !b || b.total <= a.total) return 0;
    return Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / (b.total - a.total)) * 100));
};

/** Qisqa o'lchov (joriy CPU) */
export async function sampleCpu(ms = 500): Promise<number> {
    const a = await readCpuTimes();
    await new Promise((r) => setTimeout(r, ms));
    return cpuPercent(a, await readCpuTimes());
}

export async function readMemory() {
    try {
        const text = await readFile('/proc/meminfo', 'utf8');
        const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0);
        const total = kb('MemTotal') / 1024;
        const available = kb('MemAvailable') / 1024;
        const swapTotal = kb('SwapTotal') / 1024;
        const swapFree = kb('SwapFree') / 1024;
        return { totalMb: total, usedMb: total - available, swapTotalMb: swapTotal, swapUsedMb: swapTotal - swapFree };
    } catch {
        return { totalMb: 0, usedMb: 0, swapTotalMb: 0, swapUsedMb: 0 };
    }
}

export async function readLoad() {
    try {
        const [l1, l5, l15] = (await readFile('/proc/loadavg', 'utf8')).split(' ').map(Number);
        return { load1: l1, load5: l5, load15: l15 };
    } catch {
        return { load1: 0, load5: 0, load15: 0 };
    }
}

export async function readUptimeSec() {
    try {
        return Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
    } catch {
        return 0;
    }
}

export async function readDisk() {
    try {
        const s = await statfs('/');
        const total = (s.blocks * s.bsize) / 1024 ** 3;
        const free = (s.bavail * s.bsize) / 1024 ** 3;
        return { totalGb: total, usedGb: total - free };
    } catch {
        return { totalGb: 0, usedGb: 0 };
    }
}

export interface HostContainer {
    name: string;
    service?: string;
    status: string;
    health: string | null;
    restarts: number;
    oomKilled: boolean;
    startedAt: string;
    memLimit: number;
    cpu?: number;
    mem?: string;
}

export interface HostJson {
    at: number;
    dropletId: string;
    cpus: number;
    uploadsBytes: number;
    backups: { mtime: number; size: number; name: string }[];
    containers: HostContainer[];
}

/** scripts/host-metrics.sh yozgan fayl (har daqiqada) */
export async function readHostJson(): Promise<HostJson | null> {
    try {
        return JSON.parse(await readFile('/app/host-metrics/host.json', 'utf8')) as HostJson;
    } catch {
        return null;
    }
}

/** "72.3MiB / 384MiB" → MB */
export function parseDockerSize(s: string | undefined): number {
    const m = /([\d.]+)\s*([KMGT]i?B|B)/.exec(s ?? '');
    if (!m) return 0;
    const n = Number(m[1]);
    const unit = m[2][0];
    return unit === 'K' ? n / 1024 : unit === 'M' ? n : unit === 'G' ? n * 1024 : unit === 'T' ? n * 1024 * 1024 : n / 1024 / 1024;
}
