-- Полная миграция для добавления всех полей согласия на обработку персональных данных
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Добавляем поля для Политики конфиденциальности
ALTER TABLE users
ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP WITH TIME ZONE;

-- 2. Добавляем поля для Пользовательского соглашения
ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- 3. Создаем индексы для быстрой проверки согласия
CREATE INDEX IF NOT EXISTS idx_users_privacy_accepted 
ON users(privacy_accepted) 
WHERE privacy_accepted = false;

CREATE INDEX IF NOT EXISTS idx_users_terms_accepted 
ON users(terms_accepted) 
WHERE terms_accepted = false;

-- 4. Комментарии для документации
COMMENT ON COLUMN users.privacy_accepted IS 'Согласие на обработку персональных данных согласно Политике конфиденциальности';
COMMENT ON COLUMN users.privacy_accepted_at IS 'Дата и время предоставления согласия на обработку персональных данных';
COMMENT ON COLUMN users.terms_accepted IS 'Согласие с условиями Пользовательского соглашения';
COMMENT ON COLUMN users.terms_accepted_at IS 'Дата и время принятия Пользовательского соглашения';
