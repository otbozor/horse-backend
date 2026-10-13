-- Tuman nomlaridagi imlo xatolari va eskirgan nomlar (rasmiy ro'yxat bo'yicha)
UPDATE "districts" SET "name_uz" = 'Yangihayot', "slug" = 'yangihayot' WHERE "slug" = 'yongihabot';
UPDATE "districts" SET "name_uz" = 'Tayloq', "slug" = 'tayloq' WHERE "slug" = 'toyloq';
UPDATE "districts" SET "name_uz" = 'Bag''dod', "slug" = 'bagdod' WHERE "slug" = 'bogdod';
UPDATE "districts" SET "name_uz" = 'Qumqo''rg''on', "slug" = 'qumqorgon' WHERE "slug" = 'qomqorgon';
UPDATE "districts" SET "name_uz" = 'Qanliko''l', "slug" = 'qanlikol' WHERE "slug" = 'qonlikol';
UPDATE "districts" SET "name_uz" = 'Hazorasp', "slug" = 'hazorasp' WHERE "slug" = 'xazorasp';
UPDATE "districts" SET "name_uz" = 'Qorao''zak', "slug" = 'qoraozak' WHERE "slug" = 'qaraozak';
UPDATE "districts" SET "name_uz" = 'Sharof Rashidov', "slug" = 'sharof-rashidov' WHERE "slug" = 'jizzax-tuman';
UPDATE "districts" SET "name_uz" = 'Qo''qon shahri', "slug" = 'qoqon-shahri' WHERE "slug" = 'qoqon';
UPDATE "districts" SET "name_uz" = 'Angren shahri', "slug" = 'angren-shahri' WHERE "slug" = 'angren';

-- Yetishmagan tumanlar va yirik shaharlar
INSERT INTO "districts" ("id", "region_id", "name_uz", "slug")
SELECT gen_random_uuid()::text, r."id", v.name, v.slug
FROM (VALUES
    ('toshkent-shahri', 'Mirzo Ulug''bek', 'mirzo-ulugbek'),
    ('toshkent-viloyati', 'Yangiyo''l', 'yangiyol'),
    ('toshkent-viloyati', 'Chirchiq shahri', 'chirchiq-shahri'),
    ('toshkent-viloyati', 'Olmaliq shahri', 'olmaliq-shahri'),
    ('toshkent-viloyati', 'Nurafshon shahri', 'nurafshon-shahri'),
    ('fargona', 'Oltiariq', 'oltiariq'),
    ('fargona', 'Marg''ilon shahri', 'margilon-shahri'),
    ('fargona', 'Quvasoy shahri', 'quvasoy-shahri'),
    ('andijon', 'Xonobod shahri', 'xonobod-shahri'),
    ('xorazm', 'Shovot', 'shovot'),
    ('xorazm', 'Xiva shahri', 'xiva-shahri'),
    ('qashqadaryo', 'Ko''kdala', 'kokdala'),
    ('surxondaryo', 'Bandixon', 'bandixon'),
    ('qoraqalpogiston', 'Bo''zatov', 'bozatov'),
    ('qoraqalpogiston', 'Taxiatosh', 'taxiatosh'),
    ('sirdaryo', 'Yangiyer shahri', 'yangiyer-shahri'),
    ('samarqand', 'Kattaqo''rg''on shahri', 'kattaqorgon-shahri'),
    ('buxoro', 'Kogon shahri', 'kogon-shahri'),
    ('navoiy', 'G''ozg''on shahri', 'gozgon-shahri')
) AS v(region_slug, name, slug)
JOIN "regions" r ON r."slug" = v.region_slug
ON CONFLICT ("slug") DO NOTHING;

-- Zotlar: to'g'ri o'zbekcha nom va ko'p uchraydigan zotlar
UPDATE "breeds" SET "name" = 'Qorabayir' WHERE "slug" = 'karabayir';
INSERT INTO "breeds" ("id", "name", "slug", "description", "is_active")
VALUES
    (gen_random_uuid()::text, 'Don', 'don', 'Chidamli, ko''pkari va minish uchun mashhur rus zoti', true),
    (gen_random_uuid()::text, 'Budyonniy', 'budyonniy', 'Don va ingliz zotlari duragayi — tez va chidamli', true),
    (gen_random_uuid()::text, 'Qozoq (jabe)', 'qozoq', 'Qozoq dasht zoti — chidamli, kam talabchan', true),
    (gen_random_uuid()::text, 'Qirg''iz', 'qirgiz', 'Tog''li hududlarga moslashgan, chidamli zot', true),
    (gen_random_uuid()::text, 'Tersk', 'tersk', 'Arab zoti asosida yaratilgan chiroyli sport zoti', true),
    (gen_random_uuid()::text, 'Trakenen', 'trakenen', 'Sport (konkur, manej) uchun Yevropa zoti', true),
    (gen_random_uuid()::text, 'Ganover', 'ganover', 'Nemis sport zoti — konkur va manej', true),
    (gen_random_uuid()::text, 'Rus yo''rtog''i', 'rus-yortogi', 'Yo''rtoq (rysak) zoti — arava va poyga uchun', true),
    (gen_random_uuid()::text, 'Og''ir yuk tashuvchi', 'ogir-yuk-tashuvchi', 'Vladimir, Sovet og''ir zotlari — ish va arava uchun', true),
    (gen_random_uuid()::text, 'Friz', 'friz', 'Qora rangli, chiroyli Gollandiya zoti', true),
    (gen_random_uuid()::text, 'Andalus', 'andalus', 'Ispaniya zoti — chiroyli harakatli, sayr va ko''rgazma uchun', true),
    (gen_random_uuid()::text, 'Poni', 'poni', 'Kichik bo''yli otlar — bolalar va sayr uchun', true)
ON CONFLICT ("slug") DO NOTHING;
