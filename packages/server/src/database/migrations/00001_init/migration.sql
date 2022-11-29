CREATE TABLE e2esdk_identities (
  user_id                     VARCHAR(128) PRIMARY KEY,
  created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  sharing_public_key          VARCHAR(128) UNIQUE NOT NULL,
  signature_public_key        VARCHAR(128) UNIQUE NOT NULL,
  proof                       VARCHAR(128) UNIQUE NOT NULL
);

--------------------------------------------------------------------------------

CREATE TABLE e2esdk_keychain_items (
  added_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at                  TIMESTAMP WITH TIME ZONE,
  name                        TEXT UNIQUE NOT NULL, -- encrypted
  payload                     TEXT UNIQUE NOT NULL, -- encrypted
  name_fingerprint            VARCHAR(128) NOT NULL,
  payload_fingerprint         VARCHAR(128) NOT NULL,
  owner_id                    VARCHAR(128) REFERENCES e2esdk_identities(user_id) NOT NULL,
  shared_by                   VARCHAR(128) REFERENCES e2esdk_identities(user_id),
  signature                   VARCHAR(128) UNIQUE NOT NULL,

  -- A user can only have a single copy of a key (to prevent key reuse)
  -- Note that we can't use `payload` as the unique constraint,
  -- as encryption is not deterministic, but the fingerprint is.
  CONSTRAINT e2esdk_keychain_items_pkey PRIMARY KEY (owner_id, payload_fingerprint)
);

CREATE INDEX e2esdk_keychain_items_owner_id_index             ON e2esdk_keychain_items (owner_id);            -- Query by owner (fetch own keychain)
CREATE INDEX e2esdk_keychain_items_shared_by_index            ON e2esdk_keychain_items (shared_by);           -- Query key graph by source
CREATE INDEX e2esdk_keychain_items_name_fingerprint_index     ON e2esdk_keychain_items (name_fingerprint);    -- Query key graph by namespace (get participants)
CREATE INDEX e2esdk_keychain_items_payload_fingerprint_index  ON e2esdk_keychain_items (payload_fingerprint); -- Query key graph by key value (get participants)

--------------------------------------------------------------------------------

CREATE TABLE e2esdk_shared_keys (
  shared_at                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at                  TIMESTAMP WITH TIME ZONE,
  to_user_id                  VARCHAR(128) NOT NULL REFERENCES e2esdk_identities(user_id),
  from_user_id                VARCHAR(128) NOT NULL REFERENCES e2esdk_identities(user_id),
  from_signature_public_key   VARCHAR(128) NOT NULL,
  from_sharing_public_key     VARCHAR(128) NOT NULL,
  from_proof                  VARCHAR(128) NOT NULL,
  name                        TEXT UNIQUE NOT NULL, -- encrypted
  payload                     TEXT UNIQUE NOT NULL, -- encrypted
  name_fingerprint            VARCHAR(128) NOT NULL,
  payload_fingerprint         VARCHAR(128) NOT NULL,
  signature                   VARCHAR(128) UNIQUE NOT NULL,

  -- Don't allow sending the same key multiple times to the same recipient
  -- (eg: with different other values or coming from different people)
  CONSTRAINT e2esdk_shared_keys_pkey PRIMARY KEY (to_user_id, payload_fingerprint)
);

CREATE INDEX e2esdk_shared_keys_from_user_id_index         ON e2esdk_shared_keys (from_user_id);        -- Query outgoing messages
CREATE INDEX e2esdk_shared_keys_to_user_id_index           ON e2esdk_shared_keys (to_user_id);          -- Query incoming messages
CREATE INDEX e2esdk_shared_keys_name_fingerprint_index     ON e2esdk_shared_keys (name_fingerprint);    -- Query key graph (pending invites)
CREATE INDEX e2esdk_shared_keys_payload_fingerprint_index  ON e2esdk_shared_keys (payload_fingerprint); -- Query key graph (pending invites)

--------------------------------------------------------------------------------

CREATE TABLE e2esdk_permissions (
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id                 VARCHAR(128) REFERENCES e2esdk_identities(user_id) NOT NULL,
  name_fingerprint        VARCHAR(128) NOT NULL,
  allow_sharing           BOOLEAN NOT NULL,
  allow_rotation          BOOLEAN NOT NULL,
  allow_deletion          BOOLEAN NOT NULL,
  allow_management        BOOLEAN NOT NULL,

  CONSTRAINT e2esdk_permissions_pkey PRIMARY KEY (user_id, name_fingerprint)
);

-- Add triggers for updated_at

CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TRIGGER e2esdk_permissions_updated_at_trigger
  BEFORE UPDATE ON e2esdk_permissions
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime (updated_at);
