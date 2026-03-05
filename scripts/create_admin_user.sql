-- Create dummy admin account
-- Password: admin123 (bcrypt hash below)
-- Run this against tmachat_app database

INSERT INTO users (email, name, password_hash, auth_type)
VALUES (
  'admin@tmachat.local',
  'Admin TMA',
  '$2b$12$UbkWzEkzJ2csYFebcgTf/eWxiAxDaWQujhxSkkUtZK7ynuiPVC4pa',  -- admin123
  'admin'
)
ON CONFLICT (email) DO UPDATE
SET auth_type = 'admin', name = 'Admin TMA', password_hash = EXCLUDED.password_hash;
