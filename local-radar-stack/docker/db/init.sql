CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  floor INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS radar_devices (
  id TEXT PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'online',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('fall', 'anomaly', 'bed_exit', 'toilet_entry', 'staff_entry')),
  timestamp TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  telemetry_snapshot JSONB
);

CREATE TABLE IF NOT EXISTS summaries (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  avg_height DOUBLE PRECISION NOT NULL,
  movement_level DOUBLE PRECISION NOT NULL,
  active_targets INTEGER NOT NULL,
  avg_walking_speed DOUBLE PRECISION NOT NULL,
  distance_moved DOUBLE PRECISION NOT NULL,
  gait_stability DOUBLE PRECISION NOT NULL,
  posture_stability DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  time_moving INTEGER NOT NULL DEFAULT 0,
  falls_count INTEGER NOT NULL DEFAULT 0,
  alerts_count INTEGER NOT NULL DEFAULT 0,
  avg_walking_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_gait_stability DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_posture_stability DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (radar_id, date)
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  device_id TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_spatial_stats (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hour_timestamp TIMESTAMPTZ NOT NULL,
  grid_x INTEGER NOT NULL,
  grid_y INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  UNIQUE (patient_id, hour_timestamp, grid_x, grid_y)
);

CREATE INDEX IF NOT EXISTS idx_events_radar_timestamp ON events (radar_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_radar_timestamp ON summaries (radar_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_radar_date ON daily_stats (radar_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_events_alert_status ON events ((metadata->>'alert_status'));
CREATE INDEX IF NOT EXISTS idx_radar_devices_room_id ON radar_devices (room_id);
CREATE INDEX IF NOT EXISTS idx_patients_room_id ON patients (room_id);

CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms (owner_id);
CREATE INDEX IF NOT EXISTS idx_patients_owner_id ON patients (owner_id);
CREATE INDEX IF NOT EXISTS idx_radar_devices_owner_id ON radar_devices (owner_id);
CREATE INDEX IF NOT EXISTS idx_events_owner_id ON events (owner_id);
CREATE INDEX IF NOT EXISTS idx_summaries_owner_id ON summaries (owner_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_owner_id ON daily_stats (owner_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_owner_id ON device_tokens (owner_id);
CREATE INDEX IF NOT EXISTS idx_patient_spatial_stats_owner_id ON patient_spatial_stats (owner_id);

-- Insert default admin user if no users exist
-- Note: 'admin123' bcrypt hash is used here as a placeholder fallback.
-- Hash for 'admin123': $2b$10$.r.uo8YYT8qaZ7ZCjmTW9u8a6lyFxnXblYqiWe/8HuJB1xpmoXHlC
INSERT INTO users (username, password_hash, role, permissions)
SELECT 'admin', '$2b$10$.r.uo8YYT8qaZ7ZCjmTW9u8a6lyFxnXblYqiWe/8HuJB1xpmoXHlC', 'admin', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM users);
