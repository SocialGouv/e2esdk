-- Migration 00003 - add-devices-table
-- Generated on 2023-02-04T11:59:40.376Z

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE e2esdk_devices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enrolled_from       UUID REFERENCES e2esdk_devices(id),
  owner_id            VARCHAR(128) REFERENCES e2esdk_identities(user_id) NOT NULL,
  label               TEXT,
  wrapped_main_key    TEXT NOT NULL,
  opaque_credentials  TEXT NOT NULL
);
