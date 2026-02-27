import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create regions and districts
    const regions = [
        {
            nameUz: 'Toshkent shahri',
            nameRu: 'Город Ташкент',
            slug: 'toshkent-shahri',
            districts: [
                { nameUz: 'Bektemir tumani', slug: 'bektemir' },
                { nameUz: 'Chilonzor tumani', slug: 'chilonzor' },
                { nameUz: 'Mirzo Ulug\'bek tumani', slug: 'mirzo-ulugbek' },
                { nameUz: 'Mirobod tumani', slug: 'mirobod' },
                { nameUz: 'Sirg\'ali tumani', slug: 'sirgali' },
                { nameUz: 'Shayxontohur tumani', slug: 'shayxontohur' },
                { nameUz: 'Olmazor tumani', slug: 'olmazor' },
                { nameUz: 'Uchtepa tumani', slug: 'uchtepa' },
                { nameUz: 'Yakkasaroy tumani', slug: 'yakkasaroy' },
                { nameUz: 'Yashnobod tumani', slug: 'yashnobod' },
                { nameUz: 'Yangihayot tumani', slug: 'yangihayot' },
                { nameUz: 'Yunusobod tumani', slug: 'yunusobod' },
            ],
        },
        {
            nameUz: 'Toshkent viloyati',
            nameRu: 'Ташкентская область',
            slug: 'toshkent-viloyati',
            districts: [
                { nameUz: 'Angren shahri', slug: 'angren' },
                { nameUz: 'Olmaliq shahri', slug: 'olmaliq' },
                { nameUz: 'Chirchiq shahri', slug: 'chirchiq' },
                { nameUz: 'Yangiyo\'l shahri', slug: 'yangiyl-shahri' },
                { nameUz: 'Nurafshon shahri', slug: 'nurafshon' },
                { nameUz: 'Bekobod shahri', slug: 'bekobod-shahri' },
                { nameUz: 'Ohangaron shahri', slug: 'ohangaron-shahri' },
                { nameUz: 'Oqqo\'rg\'on tumani', slug: 'oqqorgon' },
                { nameUz: 'Ohangaron tumani', slug: 'ohangaron' },
                { nameUz: 'Bekobod tumani', slug: 'bekobod' },
                { nameUz: 'Bo\'ka tumani', slug: 'boka' },
                { nameUz: 'Bo\'stonliq tumani', slug: 'bustonliq' },
                { nameUz: 'Zangiota tumani', slug: 'zangiota' },
                { nameUz: 'Yuqorichirchiq tumani', slug: 'yuqorichirchiq' },
                { nameUz: 'Quyichirchiq tumani', slug: 'quyichirchiq' },
                { nameUz: 'O\'rtachirchiq tumani', slug: 'ortachirchiq' },
                { nameUz: 'Qibray tumani', slug: 'qibray' },
                { nameUz: 'Parkent tumani', slug: 'parkent' },
                { nameUz: 'Piskent tumani', slug: 'piskent' },
                { nameUz: 'Chinoz tumani', slug: 'chinoz' },
                { nameUz: 'Yangiyo\'l tumani', slug: 'yangiyl' },
                { nameUz: 'Toshkent tumani', slug: 'toshkent-tumani' },
            ],
        },
        {
            nameUz: 'Samarqand viloyati',
            nameRu: 'Самаркандская область',
            slug: 'samarqand',
            districts: [
                { nameUz: 'Samarqand shahri', slug: 'samarqand-shahri' },
                { nameUz: 'Kattaqo\'rg\'on shahri', slug: 'kattaqorgon-shahri' },
                { nameUz: 'Oqdaryo tumani', slug: 'oqdaryo' },
                { nameUz: 'Bulung\'ur tumani', slug: 'bulungur' },
                { nameUz: 'Ishtixon tumani', slug: 'ishtixon' },
                { nameUz: 'Jomboy tumani', slug: 'jomboy' },
                { nameUz: 'Kattaqo\'rg\'on tumani', slug: 'kattaqorgon' },
                { nameUz: 'Qo\'shrabot tumani', slug: 'qoshrabot' },
                { nameUz: 'Narpay tumani', slug: 'narpay' },
                { nameUz: 'Nurobod tumani', slug: 'nurobod' },
                { nameUz: 'Pastdarg\'om tumani', slug: 'pastdargom' },
                { nameUz: 'Paxtachi tumani', slug: 'paxtachi' },
                { nameUz: 'Payariq tumani', slug: 'payariq' },
                { nameUz: 'Samarqand tumani', slug: 'samarqand-tumani' },
                { nameUz: 'Tayloq tumani', slug: 'tayloq' },
                { nameUz: 'Urgut tumani', slug: 'urgut' },
            ],
        },
        {
            nameUz: 'Buxoro viloyati',
            nameRu: 'Бухарская область',
            slug: 'buxoro',
            districts: [
                { nameUz: 'Buxoro shahri', slug: 'buxoro-shahri' },
                { nameUz: 'Kogon shahri', slug: 'kogon-shahri' },
                { nameUz: 'Olot tumani', slug: 'olot' },
                { nameUz: 'Buxoro tumani', slug: 'buxoro-tumani' },
                { nameUz: 'Vobkent tumani', slug: 'vobkent' },
                { nameUz: 'G\'ijduvon tumani', slug: 'gijduvon' },
                { nameUz: 'Kogon tumani', slug: 'kogon' },
                { nameUz: 'Qorako\'l tumani', slug: 'qorakol' },
                { nameUz: 'Qorovulbozor tumani', slug: 'qorovulbozor' },
                { nameUz: 'Peshku tumani', slug: 'peshku' },
                { nameUz: 'Romitan tumani', slug: 'romitan' },
                { nameUz: 'Jondor tumani', slug: 'jondor' },
                { nameUz: 'Shofirkon tumani', slug: 'shofirkon' },
            ],
        },
        {
            nameUz: 'Farg\'ona viloyati',
            nameRu: 'Ферганская область',
            slug: 'fargona',
            districts: [
                { nameUz: 'Farg\'ona shahri', slug: 'fargona-shahri' },
                { nameUz: 'Marg\'ilon shahri', slug: 'margilon' },
                { nameUz: 'Qo\'qon shahri', slug: 'qoqon' },
                { nameUz: 'Quvasoy shahri', slug: 'quvasoy' },
                { nameUz: 'Oltiariq tumani', slug: 'oltiariq' },
                { nameUz: 'Qo\'shtepa tumani', slug: 'qoshtepa' },
                { nameUz: 'Bog\'dod tumani', slug: 'bogdod' },
                { nameUz: 'Buvayda tumani', slug: 'buvayda' },
                { nameUz: 'Beshariq tumani', slug: 'beshariq' },
                { nameUz: 'Quva tumani', slug: 'quva' },
                { nameUz: 'Uchko\'prik tumani', slug: 'uchkuprik' },
                { nameUz: 'Rishton tumani', slug: 'rishton' },
                { nameUz: 'So\'x tumani', slug: 'soh' },
                { nameUz: 'Toshloq tumani', slug: 'toshloq' },
                { nameUz: 'O\'zbekiston tumani', slug: 'ozbekiston-tumani' },
                { nameUz: 'Farg\'ona tumani', slug: 'fargona-tumani' },
                { nameUz: 'Dang\'ara tumani', slug: 'dangara' },
                { nameUz: 'Furqat tumani', slug: 'furqat' },
                { nameUz: 'Yozyovon tumani', slug: 'yozyovon' },
            ],
        },
        {
            nameUz: 'Andijon viloyati',
            nameRu: 'Андижанская область',
            slug: 'andijon',
            districts: [
                { nameUz: 'Andijon shahri', slug: 'andijon-shahri' },
                { nameUz: 'Xonobod shahri', slug: 'xonobod' },
                { nameUz: 'Oltinko\'l tumani', slug: 'oltinkul' },
                { nameUz: 'Andijon tumani', slug: 'andijon-tumani' },
                { nameUz: 'Baliqchi tumani', slug: 'baliqchi' },
                { nameUz: 'Bo\'z tumani', slug: 'boz' },
                { nameUz: 'Buloqboshi tumani', slug: 'buloqboshi' },
                { nameUz: 'Jalaquduq tumani', slug: 'jalaquduq' },
                { nameUz: 'Izboskan tumani', slug: 'izboskan' },
                { nameUz: 'Ulug\'nor tumani', slug: 'ulugnor' },
                { nameUz: 'Qo\'rg\'ontepa tumani', slug: 'qorgontepa' },
                { nameUz: 'Asaka tumani', slug: 'asaka' },
                { nameUz: 'Marxamat tumani', slug: 'marhamat' },
                { nameUz: 'Shahrixon tumani', slug: 'shahrixon' },
                { nameUz: 'Paxtaobod tumani', slug: 'paxtaobod' },
                { nameUz: 'Xo\'jaobod tumani', slug: 'xojaobod' },
            ],
        },
        {
            nameUz: 'Namangan viloyati',
            nameRu: 'Наманганская область',
            slug: 'namangan',
            districts: [
                { nameUz: 'Namangan shahri', slug: 'namangan-shahri' },
                { nameUz: 'Mingbuloq tumani', slug: 'mingbuloq' },
                { nameUz: 'Kosonsoy tumani', slug: 'kosonsoy' },
                { nameUz: 'Namangan tumani', slug: 'namangan-tumani' },
                { nameUz: 'Norin tumani', slug: 'norin' },
                { nameUz: 'Pop tumani', slug: 'pop' },
                { nameUz: 'To\'raqo\'rg\'on tumani', slug: 'toraqorgon' },
                { nameUz: 'Uychi tumani', slug: 'uychi' },
                { nameUz: 'Uchqo\'rg\'on tumani', slug: 'uchqorgon' },
                { nameUz: 'Chortoq tumani', slug: 'chortoq' },
                { nameUz: 'Chust tumani', slug: 'chust' },
                { nameUz: 'Yangiqo\'rg\'on tumani', slug: 'yangiqorgon' },
                { nameUz: 'Davlatobod tumani', slug: 'davlatobod' },
            ],
        },
        {
            nameUz: 'Xorazm viloyati',
            nameRu: 'Хорезмская область',
            slug: 'xorazm',
            districts: [
                { nameUz: 'Urganch shahri', slug: 'urganch' },
                { nameUz: 'Xiva shahri', slug: 'xiva' },
                { nameUz: 'Bog\'ot tumani', slug: 'bogot' },
                { nameUz: 'Gurlan tumani', slug: 'gurlan' },
                { nameUz: 'Qo\'shko\'pir tumani', slug: 'qoshkopir' },
                { nameUz: 'Urganch tumani', slug: 'urganch-tumani' },
                { nameUz: 'Xazorasp tumani', slug: 'xazorasp' },
                { nameUz: 'Xonqa tumani', slug: 'xonqa' },
                { nameUz: 'Xiva tumani', slug: 'xiva-tumani' },
                { nameUz: 'Shovot tumani', slug: 'shovot' },
                { nameUz: 'Yangiariq tumani', slug: 'yangiariq' },
                { nameUz: 'Yangibozor tumani', slug: 'yangibozor' },
                { nameUz: 'Tuproqqal\'a tumani', slug: 'tuproqqala' },
            ],
        },
        {
            nameUz: 'Qashqadaryo viloyati',
            nameRu: 'Кашкадарьинская область',
            slug: 'qashqadaryo',
            districts: [
                { nameUz: 'Qarshi shahri', slug: 'qarshi' },
                { nameUz: 'Shahrisabz shahri', slug: 'shahrisabz-shahri' },
                { nameUz: 'G\'uzor tumani', slug: 'guzor' },
                { nameUz: 'Dehqonobod tumani', slug: 'dehqonobod' },
                { nameUz: 'Qamashi tumani', slug: 'qamashi' },
                { nameUz: 'Qarshi tumani', slug: 'qarshi-tumani' },
                { nameUz: 'Koson tumani', slug: 'koson' },
                { nameUz: 'Kitob tumani', slug: 'kitob' },
                { nameUz: 'Mirishkor tumani', slug: 'mirishkor' },
                { nameUz: 'Muborak tumani', slug: 'muborak' },
                { nameUz: 'Nishon tumani', slug: 'nishon' },
                { nameUz: 'Kasbi tumani', slug: 'kasbi' },
                { nameUz: 'Chiroqchi tumani', slug: 'chiroqchi' },
                { nameUz: 'Shahrisabz tumani', slug: 'shahrisabz' },
                { nameUz: 'Yakkabog\' tumani', slug: 'yakkabog' },
                { nameUz: 'Ko\'kdala tumani', slug: 'kokdala' },
            ],
        },
        {
            nameUz: 'Surxondaryo viloyati',
            nameRu: 'Сурхандарьинская область',
            slug: 'surxondaryo',
            districts: [
                { nameUz: 'Termiz shahri', slug: 'termiz' },
                { nameUz: 'Oltinsoy tumani', slug: 'oltinsoy' },
                { nameUz: 'Angor tumani', slug: 'angor' },
                { nameUz: 'Boysun tumani', slug: 'boysun' },
                { nameUz: 'Muzrabot tumani', slug: 'muzrabot' },
                { nameUz: 'Denov tumani', slug: 'denov' },
                { nameUz: 'Jarqo\'rg\'on tumani', slug: 'jarqorgon' },
                { nameUz: 'Qumqo\'rg\'on tumani', slug: 'qumqorgon' },
                { nameUz: 'Qiziriq tumani', slug: 'qiziriq' },
                { nameUz: 'Sariosiyo tumani', slug: 'sariosiyo' },
                { nameUz: 'Termiz tumani', slug: 'termiz-tumani' },
                { nameUz: 'Uzun tumani', slug: 'uzun' },
                { nameUz: 'Sherobod tumani', slug: 'sherobod' },
                { nameUz: 'Sho\'rchi tumani', slug: 'shorchi' },
                { nameUz: 'Bandixon tumani', slug: 'bandixon' },
            ],
        },
        {
            nameUz: 'Navoiy viloyati',
            nameRu: 'Навоийская область',
            slug: 'navoiy',
            districts: [
                { nameUz: 'Navoiy shahri', slug: 'navoiy-shahri' },
                { nameUz: 'Zarafshon shahri', slug: 'zarafshon' },
                { nameUz: 'G\'ozg\'on shahri', slug: 'gozgon' },
                { nameUz: 'Konimex tumani', slug: 'konimex' },
                { nameUz: 'Qiziltepa tumani', slug: 'qiziltepa' },
                { nameUz: 'Navbahor tumani', slug: 'navbahor' },
                { nameUz: 'Karmana tumani', slug: 'karmana' },
                { nameUz: 'Nurota tumani', slug: 'nurota' },
                { nameUz: 'Tomdi tumani', slug: 'tomdi' },
                { nameUz: 'Uchquduq tumani', slug: 'uchquduq' },
                { nameUz: 'Xatirchi tumani', slug: 'xatirchi' },
            ],
        },
        {
            nameUz: 'Jizzax viloyati',
            nameRu: 'Джизакская область',
            slug: 'jizzax',
            districts: [
                { nameUz: 'Jizzax shahri', slug: 'jizzax-shahri' },
                { nameUz: 'Arnasoy tumani', slug: 'arnasoy' },
                { nameUz: 'Baxmal tumani', slug: 'baxmal' },
                { nameUz: 'G\'allaorol tumani', slug: 'gallaorol' },
                { nameUz: 'Sh.Rashidov tumani', slug: 'sharashidov' },
                { nameUz: 'Do\'stlik tumani', slug: 'dustlik' },
                { nameUz: 'Zomin tumani', slug: 'zomin' },
                { nameUz: 'Zarbdor tumani', slug: 'zarbdor' },
                { nameUz: 'Mirzacho\'l tumani', slug: 'mirzachul' },
                { nameUz: 'Zafarobod tumani', slug: 'zafarobod' },
                { nameUz: 'Paxtakor tumani', slug: 'paxtakor' },
                { nameUz: 'Forish tumani', slug: 'forish' },
                { nameUz: 'Yangiobod tumani', slug: 'yangiobod' },
            ],
        },
        {
            nameUz: 'Sirdaryo viloyati',
            nameRu: 'Сырдарьинская область',
            slug: 'sirdaryo',
            districts: [
                { nameUz: 'Guliston shahri', slug: 'guliston' },
                { nameUz: 'Yangiyer shahri', slug: 'yangiyer' },
                { nameUz: 'Shirin shahri', slug: 'shirin' },
                { nameUz: 'Baxt shahri', slug: 'baxt' },
                { nameUz: 'Oqoltin tumani', slug: 'oqoltin' },
                { nameUz: 'Boyovut tumani', slug: 'boyovut' },
                { nameUz: 'Sayxunobod tumani', slug: 'sayxunobod' },
                { nameUz: 'Guliston tumani', slug: 'guliston-tumani' },
                { nameUz: 'Sardoba tumani', slug: 'sardoba' },
                { nameUz: 'Mirzaobod tumani', slug: 'mirzaobod' },
                { nameUz: 'Sirdaryo tumani', slug: 'sirdaryo-tumani' },
                { nameUz: 'Xovos tumani', slug: 'xovos' },
            ],
        },
        {
            nameUz: 'Qoraqalpog\'iston Respublikasi',
            nameRu: 'Республика Каракалпакстан',
            slug: 'qoraqalpogiston',
            districts: [
                { nameUz: 'Nukus shahri', slug: 'nukus' },
                { nameUz: 'Amudaryo tumani', slug: 'amudaryo' },
                { nameUz: 'Beruniy tumani', slug: 'beruniy' },
                { nameUz: 'Qorao\'zak tumani', slug: 'qoraozak' },
                { nameUz: 'Kegeyli tumani', slug: 'kegeyli' },
                { nameUz: 'Qo\'ng\'irot tumani', slug: 'qongirot' },
                { nameUz: 'Qanliko\'l tumani', slug: 'qanlikol' },
                { nameUz: 'Mo\'ynoq tumani', slug: 'moynoq' },
                { nameUz: 'Nukus tumani', slug: 'nukus-tumani' },
                { nameUz: 'Taxiatosh tumani', slug: 'taxiatosh' },
                { nameUz: 'Taxtako\'pir tumani', slug: 'taxtakopir' },
                { nameUz: 'To\'rtko\'l tumani', slug: 'tortkol' },
                { nameUz: 'Xo\'jayli tumani', slug: 'xojayli' },
                { nameUz: 'Chimboy tumani', slug: 'chimboy' },
                { nameUz: 'Shumanay tumani', slug: 'shumanay' },
                { nameUz: 'Ellikqal\'a tumani', slug: 'ellikqala' },
                { nameUz: 'Bo\'zatov tumani', slug: 'bozatov' },
            ],
        },
    ];

    for (const regionData of regions) {
        const { districts, ...region } = regionData;

        const createdRegion = await prisma.region.upsert({
            where: { slug: region.slug },
            update: region,
            create: region,
        });

        for (const district of districts) {
            await prisma.district.upsert({
                where: { slug: district.slug },
                update: { ...district, regionId: createdRegion.id },
                create: { ...district, regionId: createdRegion.id },
            });
        }
    }

    console.log('✅ Regions and districts seeded');

    // Create breeds
    const breeds = [
        { name: 'Qorabayir', slug: 'qorabayir', description: 'O\'zbekistonning an\'anaviy ot zoti' },
        { name: 'Qorabo\'g\'oz', slug: 'qorabogoz', description: 'Kuchli va chidamli ot zoti' },
        { name: 'Lokayi', slug: 'lokayi', description: 'Tog\' sharoitlariga moslashgan zot' },
        { name: 'Ko\'pakcha', slug: 'kopakcha', description: 'Kichik bo\'yli, chaqqon otlar' },
        { name: 'Arab', slug: 'arab', description: 'Arabiston yarim orolidan kelgan zot' },
        { name: 'Axaltekin', slug: 'axaltekin', description: 'Turkmanistondan kelgan nozik otlar' },
        { name: 'Don', slug: 'don', description: 'Rossiya Don daryosi bo\'yidan' },
        { name: 'Budyonnovsk', slug: 'budyonnovsk', description: 'Sport uchun yetishtirilgan zot' },
        { name: 'Orlov', slug: 'orlov', description: 'Rossiya trotter zoti' },
        { name: 'Aralash', slug: 'aralash', description: 'Aralash zot' },
        { name: 'Qirg\'iz', slug: 'qirgiz', description: 'Qirg\'iziston ot zoti' },
        { name: 'Qozoq', slug: 'qozoq', description: 'Qozog\'iston ot zoti' },
        { name: 'Boshqa', slug: 'boshqa', description: 'Boshqa zot' },
        { name: 'Noma\'lum', slug: 'nomalum', description: 'Zoti aniqlanmagan' },
    ];

    for (const breed of breeds) {
        await prisma.breed.upsert({
            where: { slug: breed.slug },
            update: breed,
            create: breed,
        });
    }

    console.log('✅ Breeds seeded');

    // Create default Admin user with credentials from .env
    console.log('Creating default Admin user...');

    const bcrypt = require('bcrypt');
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.upsert({
        where: { username: adminUsername },
        update: {
            password: hashedPassword,
            isAdmin: true,
            isVerified: true,
            status: 'ACTIVE',
        },
        create: {
            username: adminUsername,
            password: hashedPassword,
            displayName: 'Admin',
            isAdmin: true,
            isVerified: true,
            status: 'ACTIVE',
        },
    });

    console.log('✅ Admin user created/updated');
    console.log(`   🔐 Username: ${adminUsername}`);
    console.log(`   🔐 Password: ${adminPassword}`);

    console.log('🎉 Database seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
