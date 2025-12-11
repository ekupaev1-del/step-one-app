-- Миграция для добавления отслеживания воды
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Добавляем поле water_goal_ml в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER;

-- 2. Создаем таблицу water_logs
CREATE TABLE IF NOT EXISTS water_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml < 5000),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'miniapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON water_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, DATE(logged_at));

-- 4. Комментарии для документации
COMMENT ON TABLE water_logs IS 'Логи потребления воды пользователями';
COMMENT ON COLUMN water_logs.amount_ml IS 'Количество воды в миллилитрах';
COMMENT ON COLUMN water_logs.logged_at IS 'Время когда была выпита вода (может отличаться от created_at)';
COMMENT ON COLUMN water_logs.source IS 'Источник записи: telegram или miniapp';
COMMENT ON COLUMN users.water_goal_ml IS 'Дневная норма воды в миллилитрах';











