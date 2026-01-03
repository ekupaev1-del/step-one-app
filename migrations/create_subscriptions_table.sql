-- Миграция для создания таблицы subscriptions (подписки)
-- Выполните этот SQL в Supabase SQL Editor

-- Создаем таблицу subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  payment_id BIGINT REFERENCES payments(inv_id),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('trial', 'standard', 'standard_plus')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ, -- Для trial подписок
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_user_id ON subscriptions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id ON subscriptions(payment_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);

-- Комментарии для документации
COMMENT ON TABLE subscriptions IS 'Подписки пользователей';
COMMENT ON COLUMN subscriptions.status IS 'Статус подписки: active, expired, cancelled, trial';
COMMENT ON COLUMN subscriptions.plan_type IS 'Тип плана: trial (3 дня), standard (1 месяц), standard_plus (12 месяцев)';
COMMENT ON COLUMN subscriptions.trial_ends_at IS 'Дата окончания trial периода (если применимо)';

