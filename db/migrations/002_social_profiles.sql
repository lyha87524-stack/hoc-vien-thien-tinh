-- Social profiles, presence and friendship. Safe to run repeatedly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
UPDATE users SET last_seen_at=COALESCE(last_seen_at,created_at,NOW()) WHERE last_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at DESC);
CREATE TABLE IF NOT EXISTS friendships (
  user_low BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_low,user_high),
  CHECK(user_low < user_high)
);
CREATE INDEX IF NOT EXISTS idx_friendships_high ON friendships(user_high,user_low);
CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGSERIAL PRIMARY KEY,
  user_low BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK(user_low < user_high), CHECK(requester_id <> receiver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair ON friend_requests(user_low,user_high) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_users_username_prefix ON users (LOWER(username) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_users_display_prefix ON users (LOWER(display_name) text_pattern_ops);
