-- Final training concurrency repair.
-- PostgreSQL FK checks can acquire KEY SHARE locks on parent rows.
-- Gameplay transactions already lock characters FOR UPDATE, so activity/mail
-- inserts must not create a lock inversion on characters. These references are
-- application-owned and are retained as indexed IDs; user_id remains enforced.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS child_name
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE child.relname IN ('activity_logs','mailbox_messages')
      AND parent.relname = 'characters'
      AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.child_name, r.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_character_created
  ON activity_logs(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_character_created
  ON mailbox_messages(character_id, created_at DESC);
