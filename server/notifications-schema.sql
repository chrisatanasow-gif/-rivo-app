CREATE TABLE IF NOT EXISTS rivo_push_subscriptions (
  token_hash text PRIMARY KEY,
  endpoint_hash text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  consent_version text NOT NULL DEFAULT 'daily-offers-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  test_sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS rivo_push_deliveries (
  token_hash text NOT NULL REFERENCES rivo_push_subscriptions(token_hash) ON DELETE CASCADE,
  offer_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, offer_date)
);
CREATE INDEX IF NOT EXISTS rivo_push_delivery_date ON rivo_push_deliveries(offer_date);
