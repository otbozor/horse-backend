import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedProducts() {
    console.log('🌱 Seeding product categories...');

    // Create categories
    const categories = [
        { name: 'Egar-jabduqlar', slug: 'egar-jabduqlar' },
        { name: 'Ozuqa', slug: 'ozuqa' },
        { name: 'Dori-darmonlar', slug: 'dori-darmonlar' },
        { name: 'Parvarish vositalari', slug: 'parvarish-vositalari' },
        { name: 'Kiyimlar', slug: 'kiyimlar' },
        { name: 'Tasbehlar va jilovlar', slug: 'tasbehlar-jilovlar' },
        { name: 'Taqinchoqlar', slug: 'taqinchoqlar' },
        { name: 'Sport anjomlari', slug: 'sport-anjomlari' },
    ];

    for (const cat of categories) {
        await prisma.productCategory.upsert({
            where: { slug: cat.slug },
            update: {},
            create: cat,
        });
    }

    console.log('✅ Product categories seeded!');
    console.log('🎉 Product seeding completed!');
}

seedProducts()
    .catch((e) => {
        console.error('❌ Error seeding products:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
