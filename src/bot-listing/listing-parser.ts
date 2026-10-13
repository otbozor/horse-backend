/**
 * Botga yozilgan erkin matndan ot e'loni maydonlarini ajratib olish (AI'siz, qoidalar asosida).
 * Kirill va lotin yozuvi, "80 mln", "5000$", "80 000 000 so'm", "5 yosh", "qorabayir ayg'ir" kabi yozuvlarni tushunadi.
 */

export type Gender = 'AYGIR' | 'BIYA' | 'AXTA';
export type Purpose = 'KOPKARI' | 'SPORT' | 'SAYR' | 'ISHCHI' | 'NASLCHILIK' | 'GOSHT';

export interface Place {
    id: string;
    name: string;
    regionId?: string;
}

export interface ParsedListing {
    breedName?: string;
    gender?: Gender;
    ageYears?: number;
    color?: string;
    purpose?: Purpose;
    priceAmount?: number;
    priceCurrency?: 'UZS' | 'USD';
    regionId?: string;
    districtId?: string;
    hasPassport?: boolean;
    phone?: string;
    /** Nechta maydon topildi — matn e'longa o'xshaydimi */
    score: number;
}

const CYR: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', ғ: "g'", д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: "o'", ф: 'f', х: 'x', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'",
    ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Kichik harf, kirill → lotin, turli apostroflar → ' */
export function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[а-яёўқғҳ]/g, (ch) => CYR[ch] ?? ch)
        .replace(/[ʻʼ‘’`´]/g, "'")
        .replace(/\s+/g, ' ');
}

/** So'z chegarasi bilan qidirish (apostrof so'zning bir qismi) */
const has = (text: string, word: string) => new RegExp(`(^|[^a-z'])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);

const BREEDS: [string, string[]][] = [
    ['Karabayir', ['qorabayir', 'qorabayr', 'qorabair', 'karabayir', 'karabair', 'qora bayir']],
    ['Axaltekin', ['axaltekin', 'ahaltekin', 'axalteke', 'ahalteke', 'axal-teke', 'ahal-teke', 'akhal']],
    ['Arab', ['arab']],
    ['Loqay', ['loqay', 'lokay', 'lokai']],
    ['Yomud', ['yomud', 'iomud', 'yomut']],
    ['Ingliz', ['ingliz', 'angliy', 'chistokrov', 'thoroughbred']],
    ['Orlov', ['orlov']],
    ['Aralash', ['aralash', 'metis', 'duragay', 'gibrid']],
];

const GENDERS: [Gender, string[]][] = [
    ['AYGIR', ["ayg'ir", 'aygir', 'ayg`ir', 'jerebets', 'jerebes', 'stallion']],
    ['BIYA', ['biya', 'kobila', 'baytal']],
    ['AXTA', ['axta', 'ahta', 'merin']],
];

const COLORS: [string, string[]][] = [
    ['Qora', ['qora ', 'qora,', 'qora.', 'qorasi', 'voronoy', 'voronaya']],
    ['Jiyron', ['jiyron', 'jeyron', 'ryjiy', 'ryjaya']],
    ["To'riq", ["to'riq", 'toriq', "to'ri ", 'gnedoy', 'gnedaya']],
    ['Saman', ['saman', 'solovoy', 'solovaya']],
    ['Kulrang', ['kulrang', 'seriy', 'seraya']],
    ['Oq', [' oq ', ' oq,', ' oq.', 'oppoq', 'beliy', 'belaya']],
    ['Qashqa', ['qashqa']],
    ['Ola', [' ola ', ' ola,', 'ola-bula', 'chipor', 'pegiy']],
    ["Bo'z", ["bo'z", ' boz ']],
    ['Malla', ['malla']],
];

const PURPOSES: [Purpose, string[]][] = [
    ['KOPKARI', ["ko'pkari", 'kopkari', 'kupkari', "ko'pkar", 'uloq', 'uloq']],
    ['SPORT', ['poyga', 'sport', 'chopqir', 'skakun', 'begovoy']],
    ['NASLCHILIK', ['naslchilik', 'nasl uchun', 'zotdor', 'plemen']],
    ['SAYR', ['sayr', 'progulk', 'mingan', 'minish uchun']],
    ['ISHCHI', ['arava', 'ishchi', 'ish uchun']],
    ['GOSHT', ["go'sht", 'gosht', "so'yish", 'soyish', 'myaso']],
];

/** Viloyat nomlari va ularning shaharlari/variantlari (DB'dagi name_uz bilan solishtiriladi) */
const REGION_ALIASES: Record<string, string[]> = {
    'Toshkent shahri': ['toshkent shahri', 'toshkent sh', 'tashkent city'],
    'Toshkent viloyati': ['toshkent viloyati', 'toshkent vil', 'toshkent', 'tashkent', 'chirchiq', 'angren', 'olmaliq', "bo'ka"],
    Samarqand: ['samarqand', 'samarkand', 'urgut', "kattaqo'rg'on"],
    Buxoro: ['buxoro', 'bukhara', 'buxara', "g'ijduvon", 'kogon'],
    Xorazm: ['xorazm', 'horazm', 'urganch', 'xiva'],
    Andijon: ['andijon', 'andijan', 'asaka'],
    "Farg'ona": ["farg'ona", 'fargona', 'fergana', "qo'qon", "marg'ilon"],
    Namangan: ['namangan', 'chust'],
    Qashqadaryo: ['qashqadaryo', 'kashkadarya', 'qarshi', 'karshi', 'shahrisabz', 'kitob', "g'uzor", 'koson'],
    Surxondaryo: ['surxondaryo', 'surxandaryo', 'surkhandarya', 'termiz', 'denov', 'sherobod'],
    Jizzax: ['jizzax', 'jizzah', 'jizak', 'zomin'],
    Sirdaryo: ['sirdaryo', 'sirdarya', 'guliston', 'yangiyer'],
    Navoiy: ['navoiy', 'navoi', 'zarafshon', 'nurota'],
    "Qoraqalpog'iston": ["qoraqalpog'iston", 'qoraqalpogiston', 'karakalpak', 'nukus', "qo'ng'irot", 'beruniy'],
};

/** Narx: "80 mln", "80 million", "1,2 mlrd", "5000$", "$5000", "5 ming dollar", "80 000 000 so'm" */
export function parsePrice(t: string): { amount: number; currency: 'UZS' | 'USD' } | null {
    const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
    const usd = /(\$|dollar|usd|u\.e|y\.e|ye\b|dollor)/;
    let m = /(\d+(?:[.,]\d+)?)\s*(mlrd|milliard)/.exec(t);
    if (m) return { amount: Math.round(num(m[1]) * 1e9), currency: 'UZS' };
    m = /(\d+(?:[.,]\d+)?)\s*(mln|million|mil\b|milyon|mln\.)/.exec(t);
    if (m) return { amount: Math.round(num(m[1]) * 1e6), currency: 'UZS' };
    m = /(\d+(?:[.,]\d+)?)\s*(ming|k\b|tisyach|tis\b)\s*(\$|dollar|usd|dollor)?/.exec(t);
    if (m) return { amount: Math.round(num(m[1]) * 1000), currency: m[3] || usd.test(t.slice(m.index, m.index + 40)) ? 'USD' : 'UZS' };
    m = /\$\s*(\d[\d\s]{0,10}\d|\d)/.exec(t) ?? /(\d[\d\s]{0,10}\d|\d)\s*(\$|dollar|usd|dollor|u\.e|y\.e)/.exec(t);
    if (m) return { amount: num(m[1]), currency: 'USD' };
    // Uzun son (6+ raqam): 80000000, 80 000 000, 80.000.000
    m = /(\d{1,3}(?:[ .]\d{3}){2,}|\d{6,})(?!\d)\s*(so'm|som|sum|uzs)?/.exec(t);
    if (m && !/^\+?998/.test(m[1].replace(/[ .]/g, ''))) return { amount: Number(m[1].replace(/[ .]/g, '')), currency: 'UZS' };
    return null;
}

export function parsePhone(raw: string): string | undefined {
    const m = /(\+?998[\s-]?)?\(?(\d{2})\)?[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/.exec(raw);
    if (!m) return undefined;
    // Narx bilan adashmaslik uchun: 998 bilan boshlansa yoki operator kodi bo'lsa
    const code = m[2];
    if (!m[1] && !/^(33|50|55|77|88|90|91|93|94|95|97|98|99|20|61|62|65|66|67|69|71|72|73|74|75|76|79)$/.test(code)) return undefined;
    return `+998${code}${m[3]}${m[4]}${m[5]}`;
}

export function parseListingText(raw: string, regions: Place[] = [], districts: Place[] = []): ParsedListing {
    const t = ` ${normalize(raw)} `;
    const r: ParsedListing = { score: 0 };

    const find = <T>(table: [T, string[]][]) => table.find(([, words]) => words.some((w) => t.includes(w) || has(t, w.trim())))?.[0];

    r.breedName = find(BREEDS);
    r.gender = find(GENDERS);
    // "qorabayir" zot nomidagi "qora" rang emas
    const tColor = t.replace(/qora ?ba[iy]{1,2}r|qoraqalpog\S*|qorako'l\S*|qoraqum/g, ' ');
    r.color = COLORS.find(([, words]) => words.some((w) => tColor.includes(w) || has(tColor, w.trim())))?.[0];
    r.purpose = find(PURPOSES);

    // Toy (1-2 yosh), qulun (yangi tug'ilgan) — yosh yozilmagan bo'lsa
    const age = /(\d{1,2})\s*(yosh|yoshli|yoshda|yashar|yil|god|let\b|goda)/.exec(t) ?? /yoshi\s*:?\s*(\d{1,2})/.exec(t);
    if (age && Number(age[1]) <= 40) r.ageYears = Number(age[1]);
    else if (has(t, 'qulun')) r.ageYears = 0;
    else if (has(t, 'toy')) r.ageYears = 2;

    const price = parsePrice(t);
    if (price && price.amount > 0) {
        r.priceAmount = price.amount;
        r.priceCurrency = price.currency;
    }

    r.phone = parsePhone(raw);
    if (/(pasport|passport|hujjat|guvohnoma|dokument)/.test(t)) r.hasPassport = true;

    // Tuman (aniqroq) → viloyat; bo'lmasa viloyat nomi/shaharlari
    const dNorm = districts.map((d) => ({ ...d, n: normalize(d.name).replace(/ tumani$/, '') })).filter((d) => d.n.length >= 4);
    const district = dNorm.find((d) => has(t, d.n));
    if (district) {
        r.districtId = district.id;
        r.regionId = district.regionId;
    }
    if (!r.regionId) {
        for (const [name, aliases] of Object.entries(REGION_ALIASES)) {
            if (aliases.some((a) => has(t, a))) {
                r.regionId = regions.find((x) => normalize(x.name) === normalize(name))?.id;
                if (r.regionId) break;
            }
        }
    }

    r.score = [r.breedName, r.gender, r.ageYears !== undefined ? 1 : undefined, r.color, r.purpose, r.priceAmount, r.regionId].filter((x) => x !== undefined).length;
    return r;
}

const GENDER_WORD: Record<Gender, string> = { AYGIR: "ayg'ir", BIYA: 'biya', AXTA: 'axta' };
const BREED_UZ: Record<string, string> = { Karabayir: 'Qorabayir', Axaltekin: 'Axaltekin', Arab: 'Arab', Loqay: 'Loqay', Yomud: 'Yomud', Ingliz: 'Ingliz', Orlov: 'Orlov', Aralash: 'Aralash zot' };

/** "Qorabayir ayg'ir, 5 yosh" */
export function buildTitle(p: ParsedListing): string {
    const head = [p.breedName ? BREED_UZ[p.breedName] ?? p.breedName : 'Ot', p.gender ? GENDER_WORD[p.gender] : ''].filter(Boolean).join(' ');
    const age = p.ageYears === 0 ? 'qulun' : p.ageYears ? `${p.ageYears} yosh` : '';
    const title = [head, age].filter(Boolean).join(', ');
    return title.charAt(0).toUpperCase() + title.slice(1);
}
