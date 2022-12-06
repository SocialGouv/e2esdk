alter table "public"."contact_form_submissions" add column "signature" TEXT UNIQUE NOT NULL;
alter table "public"."contact_form_submissions" add column "sealed_secret" TEXT UNIQUE NOT NULL;
alter table "public"."contact_form_submissions" add column "public_key" TEXT UNIQUE NOT NULL;
