-- Allow 'graduates_only' as a valid role for app_users.
-- The existing CHECK constraint (if any) restricts to admin/manager/secretary/viewer.

DO $$
DECLARE
  conname TEXT;
BEGIN
  -- Find any CHECK constraint on app_users.role
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey)
  WHERE c.contype = 'c'
    AND c.conrelid = 'app_users'::regclass
    AND a.attrelid = 'app_users'::regclass
    AND a.attname = 'role'
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app_users DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_chk
  CHECK (role IN ('admin', 'manager', 'secretary', 'viewer', 'graduates_only'));
