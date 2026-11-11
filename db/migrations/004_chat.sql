-- Lightweight polling chat. Direct chats use a canonical user pair for efficient indexed reads.
CREATE TABLE IF NOT EXISTS chat_messages (
 id BIGSERIAL PRIMARY KEY, sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 receiver_id BIGINT REFERENCES users(id) ON DELETE CASCADE, room_type TEXT NOT NULL CHECK(room_type IN ('global','direct')),
 user_low BIGINT, user_high BIGINT, body VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK ((room_type='global' AND receiver_id IS NULL AND user_low IS NULL AND user_high IS NULL) OR (room_type='direct' AND receiver_id IS NOT NULL AND user_low IS NOT NULL AND user_high IS NOT NULL AND user_low < user_high)),
 CHECK (length(btrim(body)) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_chat_global_created ON chat_messages(created_at DESC,id DESC) WHERE room_type='global';
CREATE INDEX IF NOT EXISTS idx_chat_direct_pair_created ON chat_messages(user_low,user_high,created_at DESC,id DESC) WHERE room_type='direct';
CREATE INDEX IF NOT EXISTS idx_chat_sender_created ON chat_messages(sender_id,created_at DESC);
