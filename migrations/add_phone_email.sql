-- Миграция для добавления полей phone и email в таблицу users
-- Выполните этот SQL в Supabase SQL Editor

-- Добавляем поля phone и email в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;

-- Комментарии для документации
COMMENT ON COLUMN users.phone IS 'Номер телефона пользователя';
COMMENT ON COLUMN users.email IS 'Email адрес пользователя';











