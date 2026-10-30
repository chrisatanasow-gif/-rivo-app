-- Additive member-only availability and transactional Web Push. No demo/marketing data.
CREATE TABLE IF NOT EXISTS rivo_driver_presence (
  participant_id uuid PRIMARY KEY REFERENCES rivo_member_sessions(id),
  online boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  lease_id uuid,
  auth_session_hash text,
  expires_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rivo_ride_subscriptions (
  id uuid PRIMARY KEY,
  endpoint_hash text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES rivo_accounts(id),
  role text NOT NULL CHECK (role IN ('customer', 'driver')),
  auth_session_hash text NOT NULL,
  auth_expires_at timestamptz NOT NULL,
  origin text NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rivo_ride_subscription_account ON rivo_ride_subscriptions(account_id, role);
CREATE TABLE IF NOT EXISTS rivo_ride_events (
  id bigserial PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rivo_member_rides(id),
  revision integer NOT NULL,
  account_id uuid NOT NULL REFERENCES rivo_accounts(id),
  role text NOT NULL CHECK (role IN ('customer', 'driver')),
  kind text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, revision, account_id, role)
);
CREATE TABLE IF NOT EXISTS rivo_ride_deliveries (
  event_id bigint NOT NULL REFERENCES rivo_ride_events(id),
  subscription_id uuid NOT NULL REFERENCES rivo_ride_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 1,
  claim_id uuid NOT NULL,
  retry_at timestamptz NOT NULL DEFAULT now() + interval '30 seconds',
  PRIMARY KEY (event_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS rivo_ride_event_expiry ON rivo_ride_events(expires_at);

CREATE OR REPLACE FUNCTION rivo_enqueue_ride_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'waiting' THEN
    INSERT INTO rivo_ride_events (ride_id, revision, account_id, role, kind, expires_at)
      SELECT NEW.id, NEW.revision, d.account_id, 'driver', 'request', LEAST(NEW.expires_at, now() + interval '60 seconds')
      FROM rivo_driver_presence p JOIN rivo_member_sessions d ON d.id = p.participant_id
      JOIN rivo_driver_applications a ON a.account_id = d.account_id
      JOIN rivo_member_sessions c ON c.id = NEW.customer_id
      WHERE p.online AND p.expires_at > now() AND d.role = 'driver' AND d.account_id <> c.account_id
        AND a.status = 'approved' AND a.permit_valid_until >= (now() AT TIME ZONE 'Europe/Sofia')::date
        AND NOT EXISTS (SELECT 1 FROM rivo_member_rides r WHERE r.driver_id = d.id AND r.status IN ('accepted', 'arrived', 'in_progress'))
      ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO rivo_ride_events (ride_id, revision, account_id, role, kind, expires_at)
      SELECT NEW.id, NEW.revision, account_id, 'customer', NEW.status, now() + interval '2 minutes'
      FROM rivo_member_sessions WHERE id = NEW.customer_id ON CONFLICT DO NOTHING;
    IF NEW.status = 'cancelled' AND NEW.driver_id IS NOT NULL THEN
      INSERT INTO rivo_ride_events (ride_id, revision, account_id, role, kind, expires_at)
        SELECT NEW.id, NEW.revision, account_id, 'driver', NEW.status, now() + interval '2 minutes'
        FROM rivo_member_sessions WHERE id = NEW.driver_id ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER rivo_member_ride_event
  AFTER INSERT OR UPDATE OF status ON rivo_member_rides
  FOR EACH ROW EXECUTE FUNCTION rivo_enqueue_ride_event();

-- Enforce availability in the database too: old immutable previews cannot bypass it.
CREATE OR REPLACE FUNCTION rivo_require_available_driver() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p rivo_driver_presence%ROWTYPE;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'waiting' THEN
    SELECT * INTO p FROM rivo_driver_presence WHERE participant_id = NEW.driver_id FOR UPDATE;
    IF NOT FOUND OR NOT p.online OR p.expires_at <= now() OR NOT EXISTS (
      SELECT 1 FROM rivo_member_sessions d JOIN rivo_driver_applications a ON a.account_id = d.account_id
      JOIN rivo_member_sessions c ON c.id = NEW.customer_id
      WHERE d.id = NEW.driver_id AND d.account_id <> c.account_id AND a.status = 'approved'
        AND a.permit_valid_until >= (now() AT TIME ZONE 'Europe/Sofia')::date
    ) THEN RAISE EXCEPTION 'Driver must be available'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER rivo_member_driver_availability BEFORE UPDATE OF status ON rivo_member_rides
  FOR EACH ROW EXECUTE FUNCTION rivo_require_available_driver();

CREATE OR REPLACE FUNCTION rivo_stop_unapproved_driver() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'approved' OR NEW.permit_valid_until < (now() AT TIME ZONE 'Europe/Sofia')::date THEN
    UPDATE rivo_driver_presence SET online = false, revision = revision + 1, expires_at = now()
      WHERE participant_id IN (SELECT id FROM rivo_member_sessions WHERE account_id = NEW.account_id AND role = 'driver') AND online;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER rivo_driver_approval_presence AFTER UPDATE ON rivo_driver_applications
  FOR EACH ROW EXECUTE FUNCTION rivo_stop_unapproved_driver();
