-- Добавляем поле avatar_url для хранения ссылки на аватар пользователя
ALTER TABLE users
ADD COLUMN IF NOT EXISTS avatar_url TEXT;



