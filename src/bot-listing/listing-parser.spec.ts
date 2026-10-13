import { buildTitle, parseListingText, parsePrice } from './listing-parser';

const regions = ['Toshkent shahri', 'Toshkent viloyati', 'Samarqand', 'Buxoro', 'Xorazm', 'Andijon', "Farg'ona", 'Namangan', 'Qashqadaryo', 'Surxondaryo', 'Jizzax', 'Sirdaryo', 'Navoiy', "Qoraqalpog'iston"].map((name, i) => ({ id: `r${i}`, name }));
const districts = [{ id: 'd1', name: 'Urgut tumani', regionId: 'r2' }, { id: 'd2', name: 'Kitob tumani', regionId: 'r8' }, { id: 'd3', name: 'Chust tumani', regionId: 'r7' }];
const P = (t: string) => parseListingText(t, regions, districts);

describe('listing parser', () => {
    it('lotin, mln', () => {
        const p = P("Qorabayir ayg'ir sotiladi, 5 yosh, to'riq, ko'pkariga tayyor. Samarqand Urgut. Narxi 80 mln. Tel: 90 123 45 67");
        expect(p).toMatchObject({ breedName: 'Qorabayir', gender: 'AYGIR', ageYears: 5, color: "To'riq", purpose: 'KOPKARI', priceAmount: 80_000_000, priceCurrency: 'UZS', regionId: 'r2', districtId: 'd1', phone: '+998901234567' });
        expect(buildTitle(p)).toBe("Qorabayir ayg'ir, 5 yosh");
    });
    it('kirill, dollar', () => {
        const p = P('Ахалтеке бия 4 ёшли, кора. Нархи 7000$ Қашқадарё Китоб');
        expect(p).toMatchObject({ breedName: 'Axaltekin', gender: 'BIYA', ageYears: 4, priceAmount: 7000, priceCurrency: 'USD', regionId: 'r8', districtId: 'd2' });
    });
    it('uzun son va so\'m', () => {
        expect(parsePrice("narxi 45 000 000 so'm")).toEqual({ amount: 45_000_000, currency: 'UZS' });
        expect(parsePrice('120000000')).toEqual({ amount: 120_000_000, currency: 'UZS' });
        expect(parsePrice('5 ming dollar')).toEqual({ amount: 5000, currency: 'USD' });
        expect(parsePrice('$12 500')).toEqual({ amount: 12500, currency: 'USD' });
        expect(parsePrice('1,2 mlrd')).toEqual({ amount: 1_200_000_000, currency: 'UZS' });
        expect(parsePrice('+998 90 123 45 67')).toBeNull();
    });
    it('toy, axta, toshkent', () => {
        const p = P('Arab toy axta, Toshkent. 35 mln kelishamiz');
        expect(p).toMatchObject({ breedName: 'Arab', gender: 'AXTA', ageYears: 2, regionId: 'r1', priceAmount: 35_000_000 });
        expect(buildTitle(p)).toBe('Arab axta, 2 yosh');
    });
    it("qoraqalpog'iston rang emas", () => {
        const p = P("Loqay biya, Qoraqalpog'iston, Nukus, 25 mln");
        expect(p.color).toBeUndefined();
        expect(p).toMatchObject({ breedName: 'Loqay', gender: 'BIYA', regionId: 'r13', priceAmount: 25_000_000 });
    });
    it('oddiy salom e\'longa o\'xshamaydi', () => {
        expect(P('Assalomu alaykum, qalaysiz?').score).toBeLessThan(2);
    });
});

describe('yangi zotlar', () => {
    it('budyonniy, qirgiz, poni', () => {
        expect(parseListingText('Budyonniy ayg\'ir 6 yosh 90 mln').breedName).toBe('Budyonniy');
        expect(parseListingText("Qirg'iz biya, 3 yosh").breedName).toBe("Qirg'iz");
        expect(parseListingText('Poni sotiladi bolalar uchun 15 mln').breedName).toBe('Poni');
        expect(parseListingText('Будённовская кобыла').breedName).toBe('Budyonniy');
    });
});

describe('telefon narx emas', () => {
    it("tel 971234567 — narx yo'q, telefon bor", () => {
        const p = parseListingText("Qorabayir ayg'ir 5 yosh, Samarqand. Tel 971234567");
        expect(p.priceAmount).toBeUndefined();
        expect(p.phone).toBe('+998971234567');
    });
    it('+998 va narx birga', () => {
        const p = parseListingText('Arab biya 40 mln +998901234567');
        expect(p).toMatchObject({ priceAmount: 40_000_000, phone: '+998901234567' });
    });
    it('9 xonali narx (telefon emas)', () => {
        expect(parseListingText('Narxi 120000000').priceAmount).toBe(120_000_000);
        expect(parseListingText('Narxi 900000000 som').priceAmount).toBe(900_000_000);
        expect(parseListingText('80 000 000 tel 93 123 45 67')).toMatchObject({ priceAmount: 80_000_000, phone: '+998931234567' });
    });
});
