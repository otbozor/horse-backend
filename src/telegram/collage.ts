import sharp = require('sharp');

const BG = { r: 11, g: 46, b: 27, alpha: 1 }; // to'q yashil fon
const GAP = 8;

async function load(url: string): Promise<Buffer | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } catch {
        return null;
    }
}

async function cell(buf: Buffer, w: number, h: number) {
    return sharp(buf).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();
}

/** "+N" belgisi: oxirgi katak ustiga qoraytirilgan qatlam va son */
function moreOverlay(w: number, h: number, more: number) {
    const size = Math.round(Math.min(w, h) * 0.28);
    return Buffer.from(
        `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="rgba(0,0,0,0.45)"/>` +
        `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#ffffff">+${more}</text>` +
        `</svg>`,
    );
}

/**
 * Bir nechta rasmdan bitta kollaj (JPEG).
 * 2 ta — yonma-yon; 3 ta — chapda katta, o'ngda ikkita; 4+ — 2×2, oxirgisida "+N".
 * Rasm yuklanmasa null (chaqiruvchi bitta rasmga qaytadi).
 */
export async function buildCollage(urls: string[]): Promise<Buffer | null> {
    const loaded = (await Promise.all(urls.slice(0, 10).map(load))).filter((b): b is Buffer => Boolean(b));
    if (loaded.length < 2) return null;
    const total = urls.length;

    let W: number;
    let H: number;
    let cells: { left: number; top: number; w: number; h: number }[];
    if (loaded.length === 2) {
        W = 1280; H = 800;
        const w = (W - GAP) / 2;
        cells = [{ left: 0, top: 0, w, h: H }, { left: w + GAP, top: 0, w, h: H }];
    } else if (loaded.length === 3) {
        W = 1280; H = 1280;
        const big = 840;
        const small = (H - GAP) / 2;
        cells = [
            { left: 0, top: 0, w: big, h: H },
            { left: big + GAP, top: 0, w: W - big - GAP, h: small },
            { left: big + GAP, top: small + GAP, w: W - big - GAP, h: small },
        ];
    } else {
        W = 1280; H = 1280;
        const s = (W - GAP) / 2;
        cells = [
            { left: 0, top: 0, w: s, h: s },
            { left: s + GAP, top: 0, w: s, h: s },
            { left: 0, top: s + GAP, w: s, h: s },
            { left: s + GAP, top: s + GAP, w: s, h: s },
        ];
    }

    const layers: sharp.OverlayOptions[] = [];
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const w = Math.round(c.w);
        const h = Math.round(c.h);
        let img = await cell(loaded[i], w, h);
        const more = total - cells.length;
        if (i === cells.length - 1 && more > 0) {
            img = await sharp(img).composite([{ input: moreOverlay(w, h, more), top: 0, left: 0 }]).jpeg({ quality: 88 }).toBuffer();
        }
        layers.push({ input: img, left: Math.round(c.left), top: Math.round(c.top) });
    }
    return sharp({ create: { width: W, height: H, channels: 4, background: BG } })
        .composite(layers)
        .jpeg({ quality: 86 })
        .toBuffer();
}
