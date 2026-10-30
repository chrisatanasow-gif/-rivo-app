CREATE TABLE IF NOT EXISTS rivo_accounts (
  id uuid PRIMARY KEY,
  auth_subject text UNIQUE NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Separate tables keep old immutable invitation deployments away from member data.
CREATE TABLE IF NOT EXISTS rivo_member_sessions (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  gate_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'driver')),
  display_name text NOT NULL,
  vehicle_type text CHECK (vehicle_type IN ('city', 'premium')),
  vehicle_model text,
  vehicle_plate text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES rivo_accounts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS rivo_member_participant ON rivo_member_sessions(account_id, role) WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rivo_member_rides (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES rivo_member_sessions(id),
  driver_id uuid REFERENCES rivo_member_sessions(id),
  idempotency_key uuid NOT NULL,
  pickup jsonb NOT NULL,
  destination jsonb NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('city', 'premium')),
  passengers integer NOT NULL CHECK (passengers BETWEEN 1 AND 4),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  fare_quote jsonb,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired')),
  revision integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  driver_tracking_id uuid,
  driver_location jsonb,
  driver_location_updated_at timestamptz,
  UNIQUE (customer_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS rivo_member_one_customer_ride ON rivo_member_rides(customer_id) WHERE status IN ('waiting', 'accepted', 'arrived', 'in_progress');
CREATE UNIQUE INDEX IF NOT EXISTS rivo_member_one_driver_ride ON rivo_member_rides(driver_id) WHERE status IN ('accepted', 'arrived', 'in_progress');
CREATE INDEX IF NOT EXISTS rivo_member_waiting_rides ON rivo_member_rides(expires_at) WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS rivo_member_quotes (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES rivo_member_sessions(id),
  pickup jsonb NOT NULL,
  destination jsonb NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('city', 'premium')),
  fare jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rivo_member_quote_expiry ON rivo_member_quotes(expires_at);

CREATE TABLE IF NOT EXISTS rivo_driver_applications (
  account_id uuid PRIMARY KEY REFERENCES rivo_accounts(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  revision integer NOT NULL DEFAULT 1,
  legal_name text NOT NULL,
  phone text NOT NULL,
  contact_phone_enabled boolean NOT NULL DEFAULT false,
  vehicle_model text NOT NULL,
  vehicle_plate text NOT NULL,
  certificate_number text NOT NULL,
  permit_number text NOT NULL,
  permit_valid_until date NOT NULL,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Existing Preview databases already have this table. Keep the migration
-- additive so drivers must actively opt in before their number can be shared.
ALTER TABLE rivo_driver_applications ADD COLUMN IF NOT EXISTS contact_phone_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS rivo_driver_reviews (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES rivo_accounts(id),
  reviewer_id uuid NOT NULL REFERENCES rivo_accounts(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  application_revision integer NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rivo_account_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL
);
