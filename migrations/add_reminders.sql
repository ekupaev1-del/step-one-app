-- Миграция для добавления таблицы reminders (напоминаний)

-- Создаем таблицу reminders
CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('food', 'water')),
  time TEXT NOT NULL CHECK (time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(time);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active) WHERE is_active = true;

-- Комментарии для документации
COMMENT ON TABLE reminders IS 'Напоминания пользователей о еде и воде';
COMMENT ON COLUMN reminders.type IS 'Тип напоминания: food (еда) или water (вода)';
COMMENT ON COLUMN reminders.time IS 'Время напоминания в формате HH:MM (24-часовой формат)';
COMMENT ON COLUMN reminders.is_active IS 'Активно ли напоминание';


















