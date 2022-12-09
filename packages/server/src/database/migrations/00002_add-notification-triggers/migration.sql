-- Migration 00002 - add-notification-triggers
-- Generated on 2022-12-09T15:14:31.001Z

-- Keychain update notification trigger

CREATE FUNCTION e2esdk_keychain_items_upsert_notify()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('e2esdk_keychain_items_updated', NEW.owner_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER e2esdk_keychain_items_insert_trigger
  AFTER INSERT OR UPDATE ON e2esdk_keychain_items
  FOR EACH ROW
  EXECUTE PROCEDURE e2esdk_keychain_items_upsert_notify();

CREATE FUNCTION e2esdk_keychain_items_delete_notify()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('e2esdk_keychain_items_updated', OLD.owner_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER e2esdk_keychain_items_delete_trigger
  AFTER DELETE ON e2esdk_keychain_items
  FOR EACH ROW
  EXECUTE PROCEDURE e2esdk_keychain_items_delete_notify();

-- Shared key added notification trigger

CREATE FUNCTION e2esdk_shared_keys_insert_notify()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('e2esdk_shared_keys_insert', NEW.to_user_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER e2esdk_shared_keys_insert_trigger
  AFTER INSERT ON e2esdk_shared_keys
  FOR EACH ROW
  EXECUTE PROCEDURE e2esdk_shared_keys_insert_notify();
