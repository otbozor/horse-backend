import sharp = require('sharp');

const BG = { r: 11, g: 46, b: 27, alpha: 1 }; // to'q yashil fon
const GAP = 8;
const W = 1280;

interface Img { buf: Buffer; ratio: number }
interface Cell { left: number; top: number; w: number; h: number }

async function load(url: string): Promise<Img | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        // EXIF bo'yicha aylantirib olamiz, nisbat to'g'ri hisoblansin
        const buf = await sharp(Buffer.from(await res.arrayBuffer())).rotate().toBuffer();
        const m = await sharp(buf).metadata();
        if (!m.width || !m.height) return null;
        return { buf, ratio: m.width / m.height };
    } catch {
        return null;
    }
}

/**
 * Rasm katakka kesilmasdan to'liq sig'adi; bo'sh qolgan joy shu rasmning
 * xiralashtirilgan, qoraytirilgan nusxasi bilan to'ldiriladi.
 */
async function cell(img: Img, w: number, h: number) {
    const bg = await sharp(img.buf).resize(w, h, { fit: 'cover' }).blur(24).modulate({ brightness: 0.55 }).toBuffer();
    const fg = await sharp(img.buf).resize(w, h, { fit: 'inside' }).toBuffer();
    const m = await sharp(fg).metadata();
    return sharp(bg)
        .composite([{ input: fg, left: Math.round((w - m.width!) / 2), top: Math.round((h - m.height!) / 2) }])
        .jpeg({ quality: 88 })
        .toBuffer();
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
 * Joylashuv rasmlar shakliga qarab tanlanadi, shunda bo'sh joy kam qoladi:
 * 2 ta — yotiq rasmlar ustma-ust, tik rasmlar yonma-yon;
 * 3 ta — yotiq bo'lsa tepada katta + pastda ikkita, aks holda chapda katta + o'ngda ikkita;
 * 4+ — 2×2, oxirgisida "+N".
 */
function layout(imgs: Img[]): { H: number; cells: Cell[] } {
    const landscape = imgs.reduce((s, i) => s + i.ratio, 0) / imgs.length > 1.1;
    const half = (W - GAP) / 2;
    if (imgs.length === 2) {
        if (landscape) {
            const h = Math.round(W / 1.6);
            return { H: h * 2 + GAP, cells: [{ left: 0, top: 0, w: W, h }, { left: 0, top: h + GAP, w: W, h }] };
        }
        const h = Math.round(half / 0.75);
        return { H: h, cells: [{ left: 0, top: 0, w: half, h }, { left: half + GAP, top: 0, w: half, h }] };
    }
    if (imgs.length === 3) {
        if (landscape) {
            const top = Math.round(W / 1.6);
            const sh = Math.round(half / 1.4);
            return {
                H: top + GAP + sh,
                cells: [
                    { left: 0, top: 0, w: W, h: top },
                    { left: 0, top: top + GAP, w: half, h: sh },
                    { left: half + GAP, top: top + GAP, w: half, h: sh },
                ],
            };
        }
        const H = 1280;
        const big = 760;
        const small = (H - GAP) / 2;
        return {
            H,
            cells: [
                { left: 0, top: 0, w: big, h: H },
                { left: big + GAP, top: 0, w: W - big - GAP, h: small },
                { left: big + GAP, top: small + GAP, w: W - big - GAP, h: small },
            ],
        };
    }
    const h = Math.round(landscape ? half / 1.33 : half);
    return {
        H: h * 2 + GAP,
        cells: [
            { left: 0, top: 0, w: half, h },
            { left: half + GAP, top: 0, w: half, h },
            { left: 0, top: h + GAP, w: half, h },
            { left: half + GAP, top: h + GAP, w: half, h },
        ],
    };
}

/** Bir nechta rasmdan bitta kollaj (JPEG). Rasm yuklanmasa null (chaqiruvchi bitta rasmga qaytadi). */
export async function buildCollage(urls: string[]): Promise<Buffer | null> {
    const loaded = (await Promise.all(urls.slice(0, 10).map(load))).filter((b): b is Img => Boolean(b));
    if (loaded.length < 2) return null;
    const { H, cells } = layout(loaded.slice(0, 4));
    const more = urls.length - cells.length;

    const layers: sharp.OverlayOptions[] = [];
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const w = Math.round(c.w);
        const h = Math.round(c.h);
        let img = await cell(loaded[i], w, h);
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
