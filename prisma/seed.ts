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
                { nameUz: 'Sergeli tumani', slug: 'sergeli' },
                { nameUz: 'Shayxontohur tumani', slug: 'shayxontohur' },
                { nameUz: 'Olmazor tumani', slug: 'olmazor' },
                { nameUz: 'Uchtepa tumani', slug: 'uchtepa' },
                { nameUz: 'Yakkasaroy tumani', slug: 'yakkasaroy' },
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
                { nameUz: 'Bekobod tumani', slug: 'bekobod' },
                { nameUz: 'Bo\'stonliq tumani', slug: 'bustonliq' },
                { nameUz: 'Zangiota tumani', slug: 'zangiota' },
                { nameUz: 'Qibray tumani', slug: 'qibray' },
                { nameUz: 'Parkent tumani', slug: 'parkent' },
            ],
        },
        {
            nameUz: 'Samarqand viloyati',
            nameRu: 'Самаркандская область',
            slug: 'samarqand',
            districts: [
                { nameUz: 'Samarqand shahri', slug: 'samarqand-shahri' },
                { nameUz: 'Bulung\'ur tumani', slug: 'bulungur' },
                { nameUz: 'Ishtixon tumani', slug: 'ishtixon' },
                { nameUz: 'Jomboy tumani', slug: 'jomboy' },
                { nameUz: 'Kattaqo\'rg\'on tumani', slug: 'kattaqorgon' },
                { nameUz: 'Narpay tumani', slug: 'narpay' },
                { nameUz: 'Pastdarg\'om tumani', slug: 'pastdargom' },
                { nameUz: 'Payariq tumani', slug: 'payariq' },
            ],
        },
        {
            nameUz: 'Buxoro viloyati',
            nameRu: 'Бухарская область',
            slug: 'buxoro',
            districts: [
                { nameUz: 'Buxoro shahri', slug: 'buxoro-shahri' },
                { nameUz: 'G\'ijduvon tumani', slug: 'gijduvon' },
                { nameUz: 'Jondor tumani', slug: 'jondor' },
                { nameUz: 'Kogon tumani', slug: 'kogon' },
                { nameUz: 'Olot tumani', slug: 'olot' },
                { nameUz: 'Qorako\'l tumani', slug: 'qorakol' },
                { nameUz: 'Romitan tumani', slug: 'romitan' },
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
                { nameUz: 'Quva tumani', slug: 'quva' },
                { nameUz: 'Rishton tumani', slug: 'rishton' },
                { nameUz: 'So\'x tumani', slug: 'soh' },
                { nameUz: 'Uchko\'prik tumani', slug: 'uchkuprik' },
                { nameUz: 'Yozyovon tumani', slug: 'yozyovon' },
            ],
        },
        {
            nameUz: 'Andijon viloyati',
            nameRu: 'Андижанская область',
            slug: 'andijon',
            districts: [
                { nameUz: 'Andijon shahri', slug: 'andijon-shahri' },
                { nameUz: 'Asaka tumani', slug: 'asaka' },
                { nameUz: 'Baliqchi tumani', slug: 'baliqchi' },
                { nameUz: 'Jalaquduq tumani', slug: 'jalaquduq' },
                { nameUz: 'Marhamat tumani', slug: 'marhamat' },
                { nameUz: 'Oltinko\'l tumani', slug: 'oltinkul' },
                { nameUz: 'Shahrixon tumani', slug: 'shahrixon' },
            ],
        },
        {
            nameUz: 'Namangan viloyati',
            nameRu: 'Наманганская область',
            slug: 'namangan',
            districts: [
                { nameUz: 'Namangan shahri', slug: 'namangan-shahri' },
                { nameUz: 'Chortoq tumani', slug: 'chortoq' },
                { nameUz: 'Chust tumani', slug: 'chust' },
                { nameUz: 'Kosonsoy tumani', slug: 'kosonsoy' },
                { nameUz: 'Mingbuloq tumani', slug: 'mingbuloq' },
                { nameUz: 'Pop tumani', slug: 'pop' },
                { nameUz: 'Uchqo\'rg\'on tumani', slug: 'uchqorgon' },
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
                { nameUz: 'Shovot tumani', slug: 'shovot' },
                { nameUz: 'Yangiariq tumani', slug: 'yangiariq' },
                { nameUz: 'Yangibozor tumani', slug: 'yangibozor' },
            ],
        },
        {
            nameUz: 'Qashqadaryo viloyati',
            nameRu: 'Кашкадарьинская область',
            slug: 'qashqadaryo',
            districts: [
                { nameUz: 'Qarshi shahri', slug: 'qarshi' },
                { nameUz: 'Shahrisabz tumani', slug: 'shahrisabz' },
                { nameUz: 'Chiroqchi tumani', slug: 'chiroqchi' },
                { nameUz: 'Dehqonobod tumani', slug: 'dehqonobod' },
                { nameUz: 'G\'uzor tumani', slug: 'guzor' },
                { nameUz: 'Kasbi tumani', slug: 'kasbi' },
                { nameUz: 'Kitob tumani', slug: 'kitob' },
                { nameUz: 'Koson tumani', slug: 'koson' },
            ],
        },
        {
            nameUz: 'Surxondaryo viloyati',
            nameRu: 'Сурхандарьинская область',
            slug: 'surxondaryo',
            districts: [
                { nameUz: 'Termiz shahri', slug: 'termiz' },
                { nameUz: 'Angor tumani', slug: 'angor' },
                { nameUz: 'Boysun tumani', slug: 'boysun' },
                { nameUz: 'Denov tumani', slug: 'denov' },
                { nameUz: 'Jarqo\'rg\'on tumani', slug: 'jarqorgon' },
                { nameUz: 'Muzrabot tumani', slug: 'muzrabot' },
                { nameUz: 'Sherobod tumani', slug: 'sherobod' },
            ],
        },
        {
            nameUz: 'Navoiy viloyati',
            nameRu: 'Навоийская область',
            slug: 'navoiy',
            districts: [
                { nameUz: 'Navoiy shahri', slug: 'navoiy-shahri' },
                { nameUz: 'Zarafshon shahri', slug: 'zarafshon' },
                { nameUz: 'Karmana tumani', slug: 'karmana' },
                { nameUz: 'Konimex tumani', slug: 'konimex' },
                { nameUz: 'Navbahor tumani', slug: 'navbahor' },
                { nameUz: 'Nurota tumani', slug: 'nurota' },
                { nameUz: 'Tomdi tumani', slug: 'tomdi' },
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
                { nameUz: 'Do\'stlik tumani', slug: 'dustlik' },
                { nameUz: 'Forish tumani', slug: 'forish' },
                { nameUz: 'G\'allaorol tumani', slug: 'gallaorol' },
                { nameUz: 'Mirzacho\'l tumani', slug: 'mirzachul' },
            ],
        },
        {
            nameUz: 'Sirdaryo viloyati',
            nameRu: 'Сырдарьинская область',
            slug: 'sirdaryo',
            districts: [
                { nameUz: 'Guliston shahri', slug: 'guliston' },
                { nameUz: 'Yangiyer shahri', slug: 'yangiyer' },
                { nameUz: 'Boyovut tumani', slug: 'boyovut' },
                { nameUz: 'Mirzaobod tumani', slug: 'mirzaobod' },
                { nameUz: 'Oqoltin tumani', slug: 'oqoltin' },
                { nameUz: 'Sayxunobod tumani', slug: 'sayxunobod' },
                { nameUz: 'Sardoba tumani', slug: 'sardoba' },
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
                { nameUz: 'Chimboy tumani', slug: 'chimboy' },
                { nameUz: 'Ellikqala tumani', slug: 'ellikqala' },
                { nameUz: 'Mo\'ynoq tumani', slug: 'moynoq' },
                { nameUz: 'Qo\'ng\'irot tumani', slug: 'qongirot' },
                { nameUz: 'Xo\'jayli tumani', slug: 'xojayli' },
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
        { name: 'Karabayir', slug: 'karabayir', description: 'O\'zbekistonning an\'anaviy ot zoti' },
        { name: 'Qorabo\'g\'oz', slug: 'qorabogoz', description: 'Kuchli va chidamli ot zoti' },
        { name: 'Lokayi', slug: 'lokayi', description: 'Tog\' sharoitlariga moslashgan zot' },
        { name: 'Ko\'pakcha', slug: 'kopakcha', description: 'Kichik bo\'yli, chaqqon otlar' },
        { name: 'Arab', slug: 'arab', description: 'Arabiston yarim orolidan kelgan zot' },
        { name: 'Axaltekin', slug: 'axaltekin', description: 'Turkmanistondan kelgan nozik otlar' },
        { name: 'Don', slug: 'don', description: 'Rossiya Don daryosi bo\'yidan' },
        { name: 'Budyonnovsk', slug: 'budyonnovsk', description: 'Sport uchun yetishtirilgan zot' },
        { name: 'Orlov', slug: 'orlov', description: 'Rossiya trotter zoti' },
        { name: 'Aralash', slug: 'aralash', description: 'Aralash zot' },
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
