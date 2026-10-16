CREATE TABLE IF NOT EXISTS rivo_pilot_sessions (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  gate_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'driver')),
  display_name text NOT NULL,
  vehicle_type text CHECK (vehicle_type IN ('city', 'premium')),
  vehicle_model text,
  vehicle_plate text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rivo_pilot_rides (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES rivo_pilot_sessions(id),
  driver_id uuid REFERENCES rivo_pilot_sessions(id),
  idempotency_key uuid NOT NULL,
  pickup jsonb NOT NULL,
  destination jsonb NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('city', 'premium')),
  passengers integer NOT NULL CHECK (passengers BETWEEN 1 AND 4),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  fare_quote jsonb,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired')),
  revision integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

ALTER TABLE rivo_pilot_rides ADD COLUMN IF NOT EXISTS fare_quote jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS rivo_pilot_one_customer_ride
  ON rivo_pilot_rides(customer_id)
  WHERE status IN ('waiting', 'accepted', 'arrived', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS rivo_pilot_one_driver_ride
  ON rivo_pilot_rides(driver_id)
  WHERE status IN ('accepted', 'arrived', 'in_progress');

CREATE INDEX IF NOT EXISTS rivo_pilot_waiting_rides
  ON rivo_pilot_rides(vehicle_type, expires_at)
  WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS rivo_pilot_login_attempts (
  address_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rivo_pilot_quotes (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES rivo_pilot_sessions(id),
  pickup jsonb NOT NULL,
  destination jsonb NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('city', 'premium')),
  fare jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rivo_pilot_quote_expiry ON rivo_pilot_quotes(expires_at);
