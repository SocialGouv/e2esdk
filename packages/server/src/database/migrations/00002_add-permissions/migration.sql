-- Migration 00002 - add permissions
-- Generated on 2022-11-07T11:46:24.881Z

CREATE TABLE e2esdk_permissions (
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id                 VARCHAR(128) REFERENCES e2esdk_identities(user_id) NOT NULL,
  name_fingerprint        VARCHAR(128) NOT NULL,
  allow_sharing           BOOLEAN NOT NULL,
  allow_rotation          BOOLEAN NOT NULL,
  allow_deletion          BOOLEAN NOT NULL,
  allow_management        BOOLEAN NOT NULL,

  PRIMARY KEY (user_id, name_fingerprint)
);

-- Add triggers for updated_at

CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TRIGGER e2esdk_permissions_updated_at_trigger
  BEFORE UPDATE ON e2esdk_permissions
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime (updated_at);
