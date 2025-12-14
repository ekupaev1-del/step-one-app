-- Добавление полей для фиксации согласия с политикой конфиденциальности
ALTER TABLE users
ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP WITH TIME ZONE;

-- Создаем индекс для быстрой проверки согласия
CREATE INDEX IF NOT EXISTS idx_users_privacy_accepted ON users(privacy_accepted) WHERE privacy_accepted = false;
