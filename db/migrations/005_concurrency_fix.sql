-- Prevent lock inversion between gameplay transactions and quest-reward mailbox inserts.
-- mailbox_messages.character_id is an application-owned reference; the character
-- is already validated before reward creation. Removing the FK avoids PostgreSQL
-- KEY SHARE waits on characters while a training/explore transaction holds FOR UPDATE.
ALTER TABLE mailbox_messages
  DROP CONSTRAINT IF EXISTS mailbox_messages_character_id_fkey;

CREATE INDEX IF NOT EXISTS idx_mailbox_character_created
  ON mailbox_messages(character_id, created_at DESC);
