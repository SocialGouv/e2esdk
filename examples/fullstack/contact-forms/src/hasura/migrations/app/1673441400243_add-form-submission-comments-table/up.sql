CREATE TABLE "public"."contact_form_comments" (
  id                      SERIAL PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL,
  submission_bucket_id    TEXT NOT NULL,
  submission_id           SERIAL NOT NULL REFERENCES "public"."contact_form_submissions" ("id"),
  author                  TEXT NOT NULL,
  message                 TEXT NOT NULL,
  signature               TEXT NOT NULL
);
