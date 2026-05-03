import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // 1. Admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: hashedPassword,
            displayName: 'Admin',
            isAdmin: true,
            listingCredits: 999,
            hasUnlimitedListings: true,
            status: 'ACTIVE',
        },
    });
    console.log('✅ Admin user created:', admin.username);

   

    // 2. Regions
    const regions = [
        { nameUz: 'Toshkent shahri', nameRu: 'Город Ташкент', slug: 'toshkent-shahri' },
        { nameUz: 'Toshkent viloyati', nameRu: 'Ташкентская область', slug: 'toshkent-viloyati' },
        { nameUz: 'Samarqand', nameRu: 'Самарканд', slug: 'samarqand' },
        { nameUz: 'Buxoro', nameRu: 'Бухара', slug: 'buxoro' },
        { nameUz: 'Xorazm', nameRu: 'Хорезм', slug: 'xorazm' },
        { nameUz: 'Andijon', nameRu: 'Андижан', slug: 'andijon' },
        { nameUz: "Farg'ona", nameRu: 'Фергана', slug: 'fargona' },
        { nameUz: 'Namangan', nameRu: 'Наманган', slug: 'namangan' },
        { nameUz: 'Qashqadaryo', nameRu: 'Кашкадарья', slug: 'qashqadaryo' },
        { nameUz: 'Surxondaryo', nameRu: 'Сурхандарья', slug: 'surxondaryo' },
        { nameUz: 'Jizzax', nameRu: 'Джизак', slug: 'jizzax' },
        { nameUz: 'Sirdaryo', nameRu: 'Сырдарья', slug: 'sirdaryo' },
        { nameUz: 'Navoiy', nameRu: 'Навои', slug: 'navoiy' },
        { nameUz: "Qoraqalpog'iston", nameRu: 'Каракалпакстан', slug: 'qoraqalpogiston' },
    ];

    const createdRegions: Record<string, any> = {};
    for (const region of regions) {
        const created = await prisma.region.upsert({
            where: { slug: region.slug },
            update: {},
            create: region,
        });
        createdRegions[region.slug] = created;
    }
    console.log('✅ Regions created:', regions.length);

    // 2.1. Districts (Tumanlar)
    const districts = [
        // Toshkent shahri
        { regionSlug: 'toshkent-shahri', nameUz: 'Bektemir', slug: 'bektemir' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Chilonzor', slug: 'chilonzor' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Mirobod', slug: 'mirobod' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Olmazor', slug: 'olmazor' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Sergeli', slug: 'sergeli' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Shayxontohur', slug: 'shayxontohur' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Uchtepa', slug: 'uchtepa' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Yakkasaroy', slug: 'yakkasaroy' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Yashnobod', slug: 'yashnobod' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Yunusobod', slug: 'yunusobod' },
        { regionSlug: 'toshkent-shahri', nameUz: 'Yongihabot', slug: 'yongihabot' },

        // Toshkent viloyati
        { regionSlug: 'toshkent-viloyati', nameUz: 'Angren', slug: 'angren' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Bekobod', slug: 'bekobod' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Bo\'ka', slug: 'boka' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Bo\'stonliq', slug: 'bostonliq' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Chinoz', slug: 'chinoz' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Qibray', slug: 'qibray' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Oqqo\'rg\'on', slug: 'oqqorgon' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Ohangaron', slug: 'ohangaron' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Parkent', slug: 'parkent' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Piskent', slug: 'piskent' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Quyichirchiq', slug: 'quyichirchiq' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Toshkent', slug: 'toshkent' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'O\'rtachirchiq', slug: 'ortachirchiq' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Yuqorichirchiq', slug: 'yuqorichirchiq' },
        { regionSlug: 'toshkent-viloyati', nameUz: 'Zangiota', slug: 'zangiota' },

        // Samarqand
        { regionSlug: 'samarqand', nameUz: 'Samarqand shahri', slug: 'samarqand-shahri' },
        { regionSlug: 'samarqand', nameUz: 'Bulung\'ur', slug: 'bulungur' },
        { regionSlug: 'samarqand', nameUz: 'Ishtixon', slug: 'ishtixon' },
        { regionSlug: 'samarqand', nameUz: 'Jomboy', slug: 'jomboy' },
        { regionSlug: 'samarqand', nameUz: 'Kattaqo\'rg\'on', slug: 'kattaqorgon' },
        { regionSlug: 'samarqand', nameUz: 'Narpay', slug: 'narpay' },
        { regionSlug: 'samarqand', nameUz: 'Nurobod', slug: 'nurobod' },
        { regionSlug: 'samarqand', nameUz: 'Oqdaryo', slug: 'oqdaryo' },
        { regionSlug: 'samarqand', nameUz: 'Paxtachi', slug: 'paxtachi' },
        { regionSlug: 'samarqand', nameUz: 'Payariq', slug: 'payariq' },
        { regionSlug: 'samarqand', nameUz: 'Pastdarg\'om', slug: 'pastdargom' },
        { regionSlug: 'samarqand', nameUz: 'Qo\'shrabot', slug: 'qoshrabot' },
        { regionSlug: 'samarqand', nameUz: 'Samarqand', slug: 'samarqand-tuman' },
        { regionSlug: 'samarqand', nameUz: 'Toyloq', slug: 'toyloq' },
        { regionSlug: 'samarqand', nameUz: 'Urgut', slug: 'urgut' },

        // Buxoro
        { regionSlug: 'buxoro', nameUz: 'Buxoro shahri', slug: 'buxoro-shahri' },
        { regionSlug: 'buxoro', nameUz: 'Buxoro', slug: 'buxoro-tuman' },
        { regionSlug: 'buxoro', nameUz: 'Vobkent', slug: 'vobkent' },
        { regionSlug: 'buxoro', nameUz: 'G\'ijduvon', slug: 'gijduvon' },
        { regionSlug: 'buxoro', nameUz: 'Jondor', slug: 'jondor' },
        { regionSlug: 'buxoro', nameUz: 'Kogon', slug: 'kogon' },
        { regionSlug: 'buxoro', nameUz: 'Olot', slug: 'olot' },
        { regionSlug: 'buxoro', nameUz: 'Peshku', slug: 'peshku' },
        { regionSlug: 'buxoro', nameUz: 'Qorako\'l', slug: 'qorakol' },
        { regionSlug: 'buxoro', nameUz: 'Qorovulbozor', slug: 'qorovulbozor' },
        { regionSlug: 'buxoro', nameUz: 'Romitan', slug: 'romitan' },
        { regionSlug: 'buxoro', nameUz: 'Shofirkon', slug: 'shofirkon' },

        // Xorazm
        { regionSlug: 'xorazm', nameUz: 'Urganch shahri', slug: 'urganch-shahri' },
        { regionSlug: 'xorazm', nameUz: 'Bog\'ot', slug: 'bogot' },
        { regionSlug: 'xorazm', nameUz: 'Gurlan', slug: 'gurlan' },
        { regionSlug: 'xorazm', nameUz: 'Qo\'shko\'pir', slug: 'qoshkopir' },
        { regionSlug: 'xorazm', nameUz: 'Urganch', slug: 'urganch-tuman' },
        { regionSlug: 'xorazm', nameUz: 'Xiva', slug: 'xiva' },
        { regionSlug: 'xorazm', nameUz: 'Xonqa', slug: 'xonqa' },
        { regionSlug: 'xorazm', nameUz: 'Xazorasp', slug: 'xazorasp' },
        { regionSlug: 'xorazm', nameUz: 'Yangiariq', slug: 'yangiariq' },
        { regionSlug: 'xorazm', nameUz: 'Yangibozor', slug: 'yangibozor' },
        { regionSlug: 'xorazm', nameUz: 'Tuproqqal\'a', slug: 'tuproqqala' },

        // Andijon
        { regionSlug: 'andijon', nameUz: 'Andijon shahri', slug: 'andijon-shahri' },
        { regionSlug: 'andijon', nameUz: 'Andijon', slug: 'andijon-tuman' },
        { regionSlug: 'andijon', nameUz: 'Asaka', slug: 'asaka' },
        { regionSlug: 'andijon', nameUz: 'Baliqchi', slug: 'baliqchi' },
        { regionSlug: 'andijon', nameUz: 'Bo\'z', slug: 'boz' },
        { regionSlug: 'andijon', nameUz: 'Buloqboshi', slug: 'buloqboshi' },
        { regionSlug: 'andijon', nameUz: 'Jalaquduq', slug: 'jalaquduq' },
        { regionSlug: 'andijon', nameUz: 'Izboskan', slug: 'izboskan' },
        { regionSlug: 'andijon', nameUz: 'Qo\'rg\'ontepa', slug: 'qorgontepa' },
        { regionSlug: 'andijon', nameUz: 'Marhamat', slug: 'marhamat' },
        { regionSlug: 'andijon', nameUz: 'Oltinko\'l', slug: 'oltinkol' },
        { regionSlug: 'andijon', nameUz: 'Paxtaobod', slug: 'paxtaobod' },
        { regionSlug: 'andijon', nameUz: 'Ulug\'nor', slug: 'ulugnor' },
        { regionSlug: 'andijon', nameUz: 'Xo\'jaobod', slug: 'xojaobod' },
        { regionSlug: 'andijon', nameUz: 'Shahrixon', slug: 'shahrixon' },

        // Farg'ona
        { regionSlug: 'fargona', nameUz: 'Farg\'ona shahri', slug: 'fargona-shahri' },
        { regionSlug: 'fargona', nameUz: 'Beshariq', slug: 'beshariq' },
        { regionSlug: 'fargona', nameUz: 'Bog\'dod', slug: 'bogdod' },
        { regionSlug: 'fargona', nameUz: 'Buvayda', slug: 'buvayda' },
        { regionSlug: 'fargona', nameUz: 'Dang\'ara', slug: 'dangara' },
        { regionSlug: 'fargona', nameUz: 'Farg\'ona', slug: 'fargona-tuman' },
        { regionSlug: 'fargona', nameUz: 'Furqat', slug: 'furqat' },
        { regionSlug: 'fargona', nameUz: 'O\'zbekiston', slug: 'ozbekiston' },
        { regionSlug: 'fargona', nameUz: 'Qo\'qon', slug: 'qoqon' },
        { regionSlug: 'fargona', nameUz: 'Qo\'shtepa', slug: 'qoshtepa' },
        { regionSlug: 'fargona', nameUz: 'Quva', slug: 'quva' },
        { regionSlug: 'fargona', nameUz: 'Rishton', slug: 'rishton' },
        { regionSlug: 'fargona', nameUz: 'So\'x', slug: 'sox' },
        { regionSlug: 'fargona', nameUz: 'Toshloq', slug: 'toshloq' },
        { regionSlug: 'fargona', nameUz: 'Uchko\'prik', slug: 'uchkoprik' },
        { regionSlug: 'fargona', nameUz: 'Yozyovon', slug: 'yozyovon' },

        // Namangan
        { regionSlug: 'namangan', nameUz: 'Namangan shahri', slug: 'namangan-shahri' },
        { regionSlug: 'namangan', nameUz: 'Chortoq', slug: 'chortoq' },
        { regionSlug: 'namangan', nameUz: 'Chust', slug: 'chust' },
        { regionSlug: 'namangan', nameUz: 'Kosonsoy', slug: 'kosonsoy' },
        { regionSlug: 'namangan', nameUz: 'Mingbuloq', slug: 'mingbuloq' },
        { regionSlug: 'namangan', nameUz: 'Namangan', slug: 'namangan-tuman' },
        { regionSlug: 'namangan', nameUz: 'Norin', slug: 'norin' },
        { regionSlug: 'namangan', nameUz: 'Pop', slug: 'pop' },
        { regionSlug: 'namangan', nameUz: 'To\'raqo\'rg\'on', slug: 'toraqorgon' },
        { regionSlug: 'namangan', nameUz: 'Uchqo\'rg\'on', slug: 'uchqorgon' },
        { regionSlug: 'namangan', nameUz: 'Uychi', slug: 'uychi' },
        { regionSlug: 'namangan', nameUz: 'Yangiqo\'rg\'on', slug: 'yangiqorgon' },

        // Qashqadaryo
        { regionSlug: 'qashqadaryo', nameUz: 'Qarshi shahri', slug: 'qarshi-shahri' },
        { regionSlug: 'qashqadaryo', nameUz: 'Chiroqchi', slug: 'chiroqchi' },
        { regionSlug: 'qashqadaryo', nameUz: 'Dehqonobod', slug: 'dehqonobod' },
        { regionSlug: 'qashqadaryo', nameUz: 'G\'uzor', slug: 'guzor' },
        { regionSlug: 'qashqadaryo', nameUz: 'Kasbi', slug: 'kasbi' },
        { regionSlug: 'qashqadaryo', nameUz: 'Kitob', slug: 'kitob' },
        { regionSlug: 'qashqadaryo', nameUz: 'Koson', slug: 'koson' },
        { regionSlug: 'qashqadaryo', nameUz: 'Mirishkor', slug: 'mirishkor' },
        { regionSlug: 'qashqadaryo', nameUz: 'Muborak', slug: 'muborak' },
        { regionSlug: 'qashqadaryo', nameUz: 'Nishon', slug: 'nishon' },
        { regionSlug: 'qashqadaryo', nameUz: 'Qamashi', slug: 'qamashi' },
        { regionSlug: 'qashqadaryo', nameUz: 'Qarshi', slug: 'qarshi-tuman' },
        { regionSlug: 'qashqadaryo', nameUz: 'Shahrisabz', slug: 'shahrisabz' },
        { regionSlug: 'qashqadaryo', nameUz: 'Yakkabog\'', slug: 'yakkabog' },

        // Surxondaryo
        { regionSlug: 'surxondaryo', nameUz: 'Termiz shahri', slug: 'termiz-shahri' },
        { regionSlug: 'surxondaryo', nameUz: 'Angor', slug: 'angor' },
        { regionSlug: 'surxondaryo', nameUz: 'Boysun', slug: 'boysun' },
        { regionSlug: 'surxondaryo', nameUz: 'Denov', slug: 'denov' },
        { regionSlug: 'surxondaryo', nameUz: 'Jarqo\'rg\'on', slug: 'jarqorgon' },
        { regionSlug: 'surxondaryo', nameUz: 'Qiziriq', slug: 'qiziriq' },
        { regionSlug: 'surxondaryo', nameUz: 'Qo\'mqo\'rg\'on', slug: 'qomqorgon' },
        { regionSlug: 'surxondaryo', nameUz: 'Muzrabot', slug: 'muzrabot' },
        { regionSlug: 'surxondaryo', nameUz: 'Oltinsoy', slug: 'oltinsoy' },
        { regionSlug: 'surxondaryo', nameUz: 'Sariosiyo', slug: 'sariosiyo' },
        { regionSlug: 'surxondaryo', nameUz: 'Sherobod', slug: 'sherobod' },
        { regionSlug: 'surxondaryo', nameUz: 'Sho\'rchi', slug: 'shorchi' },
        { regionSlug: 'surxondaryo', nameUz: 'Termiz', slug: 'termiz-tuman' },
        { regionSlug: 'surxondaryo', nameUz: 'Uzun', slug: 'uzun' },

        // Jizzax
        { regionSlug: 'jizzax', nameUz: 'Jizzax shahri', slug: 'jizzax-shahri' },
        { regionSlug: 'jizzax', nameUz: 'Arnasoy', slug: 'arnasoy' },
        { regionSlug: 'jizzax', nameUz: 'Baxmal', slug: 'baxmal' },
        { regionSlug: 'jizzax', nameUz: 'Do\'stlik', slug: 'dostlik' },
        { regionSlug: 'jizzax', nameUz: 'Forish', slug: 'forish' },
        { regionSlug: 'jizzax', nameUz: 'G\'allaorol', slug: 'gallaorol' },
        { regionSlug: 'jizzax', nameUz: 'Jizzax', slug: 'jizzax-tuman' },
        { regionSlug: 'jizzax', nameUz: 'Mirzacho\'l', slug: 'mirzachol' },
        { regionSlug: 'jizzax', nameUz: 'Paxtakor', slug: 'paxtakor' },
        { regionSlug: 'jizzax', nameUz: 'Yangiobod', slug: 'yangiobod' },
        { regionSlug: 'jizzax', nameUz: 'Zafarobod', slug: 'zafarobod' },
        { regionSlug: 'jizzax', nameUz: 'Zarbdor', slug: 'zarbdor' },
        { regionSlug: 'jizzax', nameUz: 'Zomin', slug: 'zomin' },

        // Sirdaryo
        { regionSlug: 'sirdaryo', nameUz: 'Guliston shahri', slug: 'guliston-shahri' },
        { regionSlug: 'sirdaryo', nameUz: 'Boyovut', slug: 'boyovut' },
        { regionSlug: 'sirdaryo', nameUz: 'Guliston', slug: 'guliston-tuman' },
        { regionSlug: 'sirdaryo', nameUz: 'Mirzaobod', slug: 'mirzaobod' },
        { regionSlug: 'sirdaryo', nameUz: 'Oqoltin', slug: 'oqoltin' },
        { regionSlug: 'sirdaryo', nameUz: 'Sardoba', slug: 'sardoba' },
        { regionSlug: 'sirdaryo', nameUz: 'Sayxunobod', slug: 'sayxunobod' },
        { regionSlug: 'sirdaryo', nameUz: 'Sirdaryo', slug: 'sirdaryo-tuman' },
        { regionSlug: 'sirdaryo', nameUz: 'Xovos', slug: 'xovos' },

        // Navoiy
        { regionSlug: 'navoiy', nameUz: 'Navoiy shahri', slug: 'navoiy-shahri' },
        { regionSlug: 'navoiy', nameUz: 'Zarafshon shahri', slug: 'zarafshon-shahri' },
        { regionSlug: 'navoiy', nameUz: 'Karmana', slug: 'karmana' },
        { regionSlug: 'navoiy', nameUz: 'Konimex', slug: 'konimex' },
        { regionSlug: 'navoiy', nameUz: 'Navbahor', slug: 'navbahor' },
        { regionSlug: 'navoiy', nameUz: 'Nurota', slug: 'nurota' },
        { regionSlug: 'navoiy', nameUz: 'Qiziltepa', slug: 'qiziltepa' },
        { regionSlug: 'navoiy', nameUz: 'Tomdi', slug: 'tomdi' },
        { regionSlug: 'navoiy', nameUz: 'Uchquduq', slug: 'uchquduq' },
        { regionSlug: 'navoiy', nameUz: 'Xatirchi', slug: 'xatirchi' },

        // Qoraqalpog'iston
        { regionSlug: 'qoraqalpogiston', nameUz: 'Nukus shahri', slug: 'nukus-shahri' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Amudaryo', slug: 'amudaryo' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Beruniy', slug: 'beruniy' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Chimboy', slug: 'chimboy' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Ellikqal\'a', slug: 'ellikqala' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Kegeyli', slug: 'kegeyli' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Mo\'ynoq', slug: 'moynoq' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Nukus', slug: 'nukus-tuman' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Qonliko\'l', slug: 'qonlikol' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Qorao\'zak', slug: 'qaraozak' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Qo\'ng\'irot', slug: 'qongirot' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Shumanay', slug: 'shumanay' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Taxtako\'pir', slug: 'taxtakopir' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'To\'rtko\'l', slug: 'tortkol' },
        { regionSlug: 'qoraqalpogiston', nameUz: 'Xo\'jayli', slug: 'xojayli' },
    ];

    for (const district of districts) {
        const region = createdRegions[district.regionSlug];
        if (region) {
            await prisma.district.upsert({
                where: { slug: district.slug },
                update: {},
                create: {
                    nameUz: district.nameUz,
                    slug: district.slug,
                    regionId: region.id,
                },
            });
        }
    }
    console.log('✅ Districts created:', districts.length);

    // 3. Breeds
    const breeds = [
        { name: 'Karabayir', slug: 'karabayir', description: 'O\'zbekistonning milliy ot zoti' },
        { name: 'Arab', slug: 'arab', description: 'Arab yarim oroli ot zoti' },
        { name: 'Axaltekin', slug: 'axaltekin', description: 'Turkmanistonning milliy ot zoti' },
        { name: 'Loqay', slug: 'loqay', description: 'Tog\' ot zoti' },
        { name: 'Yomud', slug: 'yomud', description: 'Turkman ot zoti' },
        { name: 'Ingliz', slug: 'ingliz', description: 'Ingliz zoti' },
        { name: 'Orlov', slug: 'orlov', description: 'Rus ot zoti' },
        { name: 'Aralash', slug: 'aralash', description: 'Aralash zot' },
    ];

    for (const breed of breeds) {
        await prisma.breed.upsert({
            where: { slug: breed.slug },
            update: {},
            create: { ...breed, isActive: true },
        });
    }
    console.log('✅ Breeds created:', breeds.length);

    // 4. Product Categories
    const categories = [
        { name: 'Egar va jabduqlar', slug: 'egar-jabduqlar' },
        { name: 'Ozuqa va vitaminlar', slug: 'ozuqa-vitaminlar' },
        { name: 'Veterinariya', slug: 'veterinariya' },
        { name: 'Ot kiyimlari', slug: 'ot-kiyimlari' },
        { name: 'Taqinchoqlar', slug: 'taqinchoqlar' },
        { name: 'Boshqa', slug: 'boshqa' },
    ];

    for (const category of categories) {
        await prisma.productCategory.upsert({
            where: { slug: category.slug },
            update: {},
            create: category,
        });
    }
    console.log('✅ Product categories created:', categories.length);

    console.log('🎉 Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
