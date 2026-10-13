import { HttpException } from '@nestjs/common';
import { BotListingService } from './bot-listing.service';

/** Telegram, baza va Cloudinary soxta — faqat oqim mantiqi tekshiriladi */
function setup() {
    const listings = new Map<string, any>();
    const sent: { kind: string; text: string; markup?: any }[] = [];
    const prisma: any = {
        user: {
            findUnique: jest.fn(async () => (prisma._user ? { id: 'u1', status: 'ACTIVE' } : null)),
            create: jest.fn(async () => {
                prisma._user = true;
                return { id: 'u1', status: 'ACTIVE' };
            }),
        },
        region: { findMany: jest.fn(async () => [{ id: 'r-sam', nameUz: 'Samarqand' }, { id: 'r-qash', nameUz: 'Qashqadaryo' }]) },
        district: { findMany: jest.fn(async () => [{ id: 'd-urgut', nameUz: 'Urgut tumani', regionId: 'r-sam' }]) },
        breed: { findMany: jest.fn(async () => [{ id: 'b-qb', name: 'Karabayir' }]) },
        horseListing: {
            findUnique: jest.fn(async ({ where }: any) => {
                const l = listings.get(where.id);
                return l && { ...l, region: l.regionId ? { nameUz: 'Samarqand' } : null, district: null, breed: l.breedId ? { name: 'Karabayir' } : null, media: l.media ?? [] };
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const l = listings.get(where.id);
                for (const [k, v] of Object.entries(data)) if (v !== undefined) l[k] = v;
                return l;
            }),
            deleteMany: jest.fn(async ({ where }: any) => listings.delete(where.id)),
        },
    };
    const listingsService: any = {
        createDraft: jest.fn(async (_u: string, dto: any) => {
            const l = { id: 'L1', status: 'DRAFT', ageYears: null, color: null, regionId: null, breedId: null, ...dto };
            listings.set('L1', l);
            return l;
        }),
        submitForReview: jest.fn(async () => ({})),
    };
    const media: any = {
        uploadFile: jest.fn(async () => ({ url: `https://res.cloudinary.com/x/${Math.random()}.jpg` })),
        attachMediaToListing: jest.fn(async (id: string, m: any[]) => (listings.get(id).media = m)),
    };
    let hook: (ctx: any) => Promise<boolean> = async () => false;
    const chat: any = { addMessageHook: (fn: any) => (hook = fn) };
    const bot: any = {
        telegram: {
            sendMessage: jest.fn(async (_c: number, text: string, o: any) => sent.push({ kind: 'text', text, markup: o?.reply_markup })),
            sendPhoto: jest.fn(async (_c: number, _p: string, o: any) => sent.push({ kind: 'photo', text: o.caption, markup: o.reply_markup })),
            getFileLink: jest.fn(async (id: string) => new URL(`https://api.telegram.org/file/${id}`)),
            getChat: jest.fn(async () => ({ first_name: 'Ali', username: 'ali' })),
        },
    };
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) })) as any;
    const svc = new BotListingService(prisma, media, listingsService, chat, { get: () => 'https://app.otbozor.uz' } as any, bot);
    svc.onModuleInit();
    const msg = (m: any) => hook({ chat: { type: 'private', id: 5 }, from: { id: 5 }, message: m });
    const flush = async () => {
        await jest.advanceTimersByTimeAsync(3000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    return { svc, msg, flush, sent, listings, listingsService, media, prisma };
}

const photo = (id: string) => ({ photo: [{ file_id: `${id}-small` }, { file_id: id }] });

describe('BotListingService', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("albom + izoh → to'liq qoralama va 'Joylash' tugmasi", async () => {
        const t = setup();
        expect(await t.msg({ ...photo('p1'), caption: "Qorabayir ayg'ir, 5 yosh, to'riq. Samarqand Urgut. Narxi 80 mln" })).toBe(true);
        expect(await t.msg(photo('p2'))).toBe(true);
        await t.flush();
        expect(t.listingsService.createDraft).toHaveBeenCalledTimes(1);
        const dto = t.listingsService.createDraft.mock.calls[0][1];
        expect(dto).toMatchObject({ title: "Qorabayir ayg'ir, 5 yosh", regionId: 'r-sam', districtId: 'd-urgut', breedId: 'b-qb', priceAmount: 80_000_000, color: "To'riq", ageYears: 5, gender: 'AYGIR' });
        expect(t.media.attachMediaToListing.mock.calls[0][1]).toHaveLength(2);
        const card = t.sent.find((s) => s.kind === 'photo')!;
        expect(card.text).toContain("qoralamasi tayyor");
        expect(JSON.stringify(card.markup)).toContain('bl:s:L1');
        expect(t.prisma.user.create).toHaveBeenCalled(); // yangi foydalanuvchi ro'yxatdan o'tdi
    });

    it("avval matn → rasm so'raydi; rasm kelgach qoralama", async () => {
        const t = setup();
        expect(await t.msg({ text: 'Qorabayir biya 4 yosh 60 mln Samarqand' })).toBe(true);
        await t.flush();
        expect(t.sent[0].text).toContain('rasmlarini');
        await t.msg(photo('p1'));
        await t.flush();
        expect(t.listingsService.createDraft).toHaveBeenCalledTimes(1);
        expect(t.sent.some((s) => s.kind === 'photo' && JSON.stringify(s.markup).includes('bl:s:L1'))).toBe(true);
    });

    it("narx yo'q → 'Joylash' yo'q; keyin '75 mln' yozilsa qo'shiladi", async () => {
        const t = setup();
        await t.msg({ ...photo('p1'), caption: "Qorabayir ayg'ir 6 yosh Samarqand" });
        await t.flush();
        let card = t.sent.filter((s) => s.kind === 'photo').pop()!;
        expect(card.text).toContain('narx');
        expect(JSON.stringify(card.markup)).not.toContain('bl:s:');
        await t.msg({ text: '75 mln' });
        await t.flush();
        expect(t.listings.get('L1').priceAmount).toBe(75_000_000);
        card = t.sent.filter((s) => s.kind === 'photo').pop()!;
        expect(JSON.stringify(card.markup)).toContain('bl:s:L1');
        expect(t.listingsService.createDraft).toHaveBeenCalledTimes(1);
    });

    it("oddiy salom — ushlanmaydi (menyu ko'rsatiladi)", async () => {
        const t = setup();
        expect(await t.msg({ text: 'Assalomu alaykum' })).toBe(false);
    });

    it("bepul e'lon tugagan (402) → to'lov sahifasi", async () => {
        const t = setup();
        t.prisma._user = true;
        t.listingsService.submitForReview.mockRejectedValueOnce(new HttpException({ requiresPayment: true }, 402));
        const replies: any[] = [];
        await t.svc.submit({ from: { id: 5 }, reply: async (text: string, o: any) => replies.push({ text, o }), editMessageReplyMarkup: async () => undefined } as any, 'L1');
        expect(JSON.stringify(replies[0].o)).toContain('/listings/L1/publish');
    });
});
