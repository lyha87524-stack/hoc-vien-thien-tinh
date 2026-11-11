ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_training_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mailbox_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'notice',
  source_type TEXT,
  source_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_user_created ON mailbox_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_unread ON mailbox_messages(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mailbox_source ON mailbox_messages(user_id, source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Additional purchasable equipment and useful consumables; idempotent by item name.
INSERT INTO items(name,description,category,rarity,icon,price_coin,effect) VALUES
('Bình Sinh Mệnh','Hồi phục 60 HP ngay lập tức.','consumable','uncommon','🧴',120,'{"hp":60}'),
('Tinh Tú Dược','Hồi phục 50 MP ngay lập tức.','consumable','uncommon','💙',140,'{"mp":50}'),
('Bánh Kinh Nghiệm','Dùng để nhận thêm 50 EXP.','consumable','uncommon','🍡',180,'{"exp":50}'),
('Áo Choàng Ngân Hà','Trang bị tăng 5 phòng ngự.','armor','rare','🧥',420,'{"def":5}'),
('Giày Sao Băng','Trang bị tăng 4 tốc độ.','armor','rare','🥾',380,'{"spd":4}'),
('Trượng Ánh Trăng','Trang bị tăng 6 công kích và 3 trí tuệ.','weapon','epic','🪄',650,'{"atk":6,"intelligence":3}'),
('Nhẫn Hộ Mệnh','Trang bị tăng 3 may mắn và 2 phòng ngự.','accessory','rare','💍',500,'{"luk":3,"def":2}')
ON CONFLICT(name) DO NOTHING;
