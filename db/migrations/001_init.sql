CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, username VARCHAR(24) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, display_name VARCHAR(60) NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player','admin')),
  avatar TEXT NOT NULL DEFAULT '🌟', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '✨', theme_color TEXT NOT NULL DEFAULT '#d9c4ee',
  admission_level INTEGER NOT NULL DEFAULT 1, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS academy_classes (
  id BIGSERIAL PRIMARY KEY, department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL, teacher_name TEXT NOT NULL DEFAULT 'Chưa phân công',
  UNIQUE(department_id,name)
);
CREATE TABLE IF NOT EXISTS characters (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL, avatar TEXT NOT NULL DEFAULT '🧚', fullbody_url TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Không xác định', age SMALLINT, birthday DATE,
  height_cm NUMERIC(5,1), weight_kg NUMERIC(5,1), race TEXT NOT NULL DEFAULT 'Nhân tộc',
  personality TEXT NOT NULL DEFAULT '', appearance TEXT NOT NULL DEFAULT '', biography TEXT NOT NULL DEFAULT '',
  hobbies TEXT NOT NULL DEFAULT '', strengths TEXT NOT NULL DEFAULT '', weaknesses TEXT NOT NULL DEFAULT '',
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  class_id BIGINT REFERENCES academy_classes(id) ON DELETE SET NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level>=1), exp BIGINT NOT NULL DEFAULT 0 CHECK(exp>=0),
  hp INTEGER NOT NULL DEFAULT 100, mp INTEGER NOT NULL DEFAULT 50,
  atk INTEGER NOT NULL DEFAULT 10, def INTEGER NOT NULL DEFAULT 10, spd INTEGER NOT NULL DEFAULT 10,
  intelligence INTEGER NOT NULL DEFAULT 10, luk INTEGER NOT NULL DEFAULT 5,
  stat_points INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT 'Tân sinh viên',
  star_coin BIGINT NOT NULL DEFAULT 1000, academy_point BIGINT NOT NULL DEFAULT 0,
  crystal BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_level ON characters(level DESC, exp DESC);
CREATE TABLE IF NOT EXISTS skills (
  id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '',
  skill_type TEXT NOT NULL CHECK(skill_type IN ('active','passive','special')),
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  required_level INTEGER NOT NULL DEFAULT 1, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS character_skills (
  character_id BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  skill_id BIGINT REFERENCES skills(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(character_id,skill_id)
);
CREATE TABLE IF NOT EXISTS quests (
  id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  quest_type TEXT NOT NULL DEFAULT 'academy', target_count INTEGER NOT NULL DEFAULT 1 CHECK(target_count>0),
  reward_exp BIGINT NOT NULL DEFAULT 0, reward_coin BIGINT NOT NULL DEFAULT 0,
  reward_point BIGINT NOT NULL DEFAULT 0, starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT TRUE,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS character_quests (
  id BIGSERIAL PRIMARY KEY, character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id BIGINT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','completed','claimed')),
  claimed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(character_id,quest_id)
);
CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'material', rarity TEXT NOT NULL DEFAULT 'common',
  icon TEXT NOT NULL DEFAULT '📦', price_coin BIGINT NOT NULL DEFAULT 0,
  price_point BIGINT NOT NULL DEFAULT 0, effect JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS inventory (
  character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
  equipped BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(character_id,item_id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY, character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id BIGINT REFERENCES items(id) ON DELETE SET NULL, transaction_type TEXT NOT NULL,
  currency TEXT NOT NULL, amount BIGINT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🗺️', image_url TEXT NOT NULL DEFAULT '',
  required_level INTEGER NOT NULL DEFAULT 1, reward_exp BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS character_locations (
  character_id BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES locations(id) ON DELETE CASCADE,
  explored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(character_id,location_id)
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL,
  action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_character ON activity_logs(character_id,created_at DESC);
CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', condition_type TEXT NOT NULL, threshold BIGINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS character_achievements (
  character_id BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  achievement_id BIGINT REFERENCES achievements(id) ON DELETE CASCADE,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(character_id,achievement_id)
);
INSERT INTO departments(name,description,icon,theme_color) VALUES
('Khoa Ma Pháp','Nghiên cứu ma lực và thuật thức cổ xưa.','🔮','#d9c4ee'),
('Khoa Kiếm Thuật','Rèn luyện kiếm ý, phản xạ và thể thuật.','⚔️','#f4c6cf'),
('Khoa Triệu Hồi','Kết nối linh thể và sinh vật huyền bí.','🪄','#c6dcf5'),
('Khoa Dược Thuật','Điều chế dược phẩm và hồi phục.','🧪','#c6e8d5'),
('Khoa Luyện Kim','Chế tác trang bị và tinh thể.','⚗️','#f5dfae'),
('Khoa Hỗ Trợ','Bảo hộ, trị liệu và tăng cường đồng đội.','💗','#f4cde5'),
('Khoa Dị Năng','Khám phá những năng lực hiếm.','🌙','#c9c8f2'),
('Khoa Khám Phá','Thám hiểm di tích và vùng đất mới.','🧭','#c8e5e8')
ON CONFLICT(name) DO NOTHING;
INSERT INTO academy_classes(department_id,name) SELECT id,'Lớp Tân Tinh' FROM departments ON CONFLICT DO NOTHING;
INSERT INTO locations(name,description,icon,required_level,reward_exp) VALUES
('Cổng Học Viện','Nơi các tân sinh viên đặt chân đến.','🏰',1,10),
('Đại Sảnh','Trung tâm sinh hoạt và thông báo học viện.','🏛️',1,15),
('Thư Viện','Kho tri thức với những cuốn sách cổ.','📚',2,25),
('Ký Túc Xá','Không gian nghỉ ngơi của học viên.','🏡',1,10),
('Sân Huấn Luyện','Rèn luyện thể chất và kỹ năng chiến đấu.','⚔️',2,30),
('Khu Ma Pháp','Nơi thực hành ma pháp nguyên tố.','🔮',3,40),
('Khu Rừng Tinh Linh','Khu rừng có những linh thể cư ngụ.','🌳',5,70),
('Hồ Ánh Trăng','Hồ nước phát sáng dưới trăng.','🌙',4,50),
('Chợ Học Viện','Mua bán vật phẩm thiết yếu.','🛍️',1,10),
('Tháp Thử Thách','Thử thách dành cho học viên mạnh.','🗼',10,150)
ON CONFLICT(name) DO NOTHING;
INSERT INTO items(name,description,category,rarity,icon,price_coin,effect) VALUES
('Bánh Sao','Một chiếc bánh nhỏ hồi phục 20 HP.','consumable','common','🍰',50,'{"hp":20}'),
('Thuốc Ma Lực','Hồi phục 15 MP.','consumable','common','🧪',65,'{"mp":15}'),
('Nhẫn Tinh Tú','Nhẫn trang trí mang năng lượng dịu nhẹ.','accessory','rare','💍',300,'{"luk":2}'),
('Kiếm Gỗ Đào','Vũ khí tập luyện cho tân sinh viên.','weapon','common','🗡️',180,'{"atk":3}')
ON CONFLICT(name) DO NOTHING;
INSERT INTO quests(title,description,quest_type,target_count,reward_exp,reward_coin) VALUES
('Chào mừng tân tinh','Khám phá hồ sơ và làm quen học viện.','academy',1,50,100),
('Dạo quanh học viện','Khám phá 2 khu vực bất kỳ.','explore',2,80,150),
('Chăm chỉ luyện tập','Hoàn thành một hoạt động huấn luyện.','training',1,60,120)
ON CONFLICT DO NOTHING;
INSERT INTO achievements(code,name,description,condition_type,threshold) VALUES
('first_explore','Nhà thám hiểm','Khám phá khu vực đầu tiên.','explore',1),
('level_5','Tân tinh triển vọng','Đạt cấp độ 5.','level',5),
('quest_10','Học viên chăm chỉ','Hoàn thành 10 nhiệm vụ.','quest',10)
ON CONFLICT(code) DO NOTHING;
