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

    for (const region of regions) {
        await prisma.region.upsert({
            where: { slug: region.slug },
            update: {},
            create: region,
        });
    }
    console.log('✅ Regions created:', regions.length);

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
