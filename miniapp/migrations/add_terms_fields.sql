-- Добавление полей для фиксации согласия с пользовательским соглашением
ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Создаем индекс для быстрой проверки согласия
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted) WHERE terms_accepted = false;
