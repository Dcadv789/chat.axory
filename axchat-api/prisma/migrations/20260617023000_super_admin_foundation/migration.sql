ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "is_super_admin" = true
WHERE "email" = 'admin@bravy.com';
