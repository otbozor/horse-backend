import type { InlineKeyboardMarkup } from 'telegraf/types';

/** Bot xabarlari ostidagi asosiy menyu: Mini App bo'limlarini to'g'ridan-to'g'ri ochadi */
export function mainMenuKeyboard(miniAppUrl: string): InlineKeyboardMarkup | undefined {
    if (!miniAppUrl) return undefined;
    const open = (text: string, path = '') => ({ text, web_app: { url: `${miniAppUrl}${path}` } });
    return {
        inline_keyboard: [
            [open('🐴 Otlarni ko\'rish')],
            [open('➕ E\'lon joylash', '/create'), open('🏇 Ko\'pkari', '/kopkari')],
            [open('❤️ Saqlanganlar', '/favorites'), open('🔔 Bildirishnomalar', '/notifications')],
        ],
    };
}

export const WELCOME_TEXT =
    '🐴 <b>Otbozor — ot savdosi Telegram ichida</b>\n\n' +
    '• Ot, anjom va xizmat e\'lonlarini ko\'ring\n' +
    '• 2 daqiqada e\'lon joylang — moderatordan so\'ng bozorga chiqadi\n' +
    '• Ko\'pkari taqvimi va kim oshdi savdolari\n' +
    '• Sotuvchiga raqamingizni ko\'rsatmasdan shu bot orqali yozing\n\n' +
    'Boshlash uchun pastdagi tugmani bosing 👇';

export const HELP_TEXT =
    '🆘 <b>Yordam</b>\n\n' +
    '<b>Qanday ishlaydi?</b>\n' +
    '1. «🐴 Otlarni ko\'rish» tugmasi Otbozor ilovasini ochadi.\n' +
    '2. Yoqqan e\'londa sotuvchiga qo\'ng\'iroq qiling yoki yozing.\n' +
    '3. O\'z otingizni sotish uchun «➕ E\'lon joylash» ni bosing.\n\n' +
    '<b>Buyruqlar</b>\n' +
    '/start — bosh menyu\n' +
    '/elon — e\'lon joylash\n' +
    '/kopkari — ko\'pkari taqvimi\n' +
    '/saqlangan — saqlangan e\'lonlar\n' +
    '/sozlamalar — bildirishnoma sozlamalari\n\n' +
    '<b>Sotuvchi bilan bot orqali yozishyapsizmi?</b>\n' +
    'Yozgan xabaringiz suhbatdoshga yetkaziladi. Suhbatni «Yakunlash» tugmasi bilan to\'xtatasiz.\n\n' +
    'Savol yoki muammo bo\'lsa: @otbozor_support';

export const FALLBACK_TEXT =
    '🤖 Men buyruqlarni tushunaman, oddiy xabarlarni emas.\n\n' +
    'Ot qidirish yoki e\'lon joylash uchun pastdagi tugmalardan foydalaning. Yordam: /help';

/** Bot buyruqlari ro'yxati (Telegram'dagi "Menu" tugmasi) */
export const BOT_COMMANDS = {
    uz: [
        { command: 'start', description: 'Bosh menyu' },
        { command: 'elon', description: "E'lon joylash" },
        { command: 'kopkari', description: "Ko'pkari taqvimi" },
        { command: 'saqlangan', description: "Saqlangan e'lonlar" },
        { command: 'sozlamalar', description: 'Bildirishnoma sozlamalari' },
        { command: 'help', description: 'Yordam' },
    ],
    ru: [
        { command: 'start', description: 'Главное меню' },
        { command: 'elon', description: 'Разместить объявление' },
        { command: 'kopkari', description: 'Календарь кёпкари' },
        { command: 'saqlangan', description: 'Избранное' },
        { command: 'sozlamalar', description: 'Настройки уведомлений' },
        { command: 'help', description: 'Помощь' },
    ],
};
