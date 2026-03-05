-- Migration: Create app_settings table
-- Run this against tmachat_app database

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings (skip if already exists)
INSERT INTO app_settings (key, value) VALUES
  ('openrouter_api_key',        ''),
  ('openrouter_model',          'stepfun/step-3.5-flash:free'),
  ('openrouter_vision_model',   'google/gemma-3-12b-it:free'),
  ('gemini_api_key',            ''),
  ('gemini_model',              'gemini-2.5-flash'),
  ('active_database_context',   'SDA'),
  ('max_history_messages',      '10')
ON CONFLICT (key) DO NOTHING;
