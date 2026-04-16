-- Backfill contact info for existing listings from user data
-- This ensures old listings show correct contact info

UPDATE "horse_listings" hl
SET 
    contact_name = COALESCE(hl.contact_name, u.display_name),
    contact_phone = COALESCE(hl.contact_phone, u.phone),
    contact_telegram = COALESCE(hl.contact_telegram, u.telegram_username)
FROM "users" u
WHERE hl.user_id = u.id
  AND (hl.contact_name IS NULL OR hl.contact_phone IS NULL OR hl.contact_telegram IS NULL);
