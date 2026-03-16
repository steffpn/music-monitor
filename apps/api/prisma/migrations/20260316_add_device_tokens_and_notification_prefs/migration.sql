-- Add notification preference columns to users table
ALTER TABLE users ADD COLUMN daily_digest_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create device_tokens table
CREATE TABLE device_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_device_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
