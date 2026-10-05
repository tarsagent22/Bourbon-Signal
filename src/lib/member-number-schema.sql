CREATE TABLE IF NOT EXISTS member_number_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
INSERT INTO member_number_counter(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS member_numbers (
  user_id text PRIMARY KEY,
  member_number bigint NOT NULL UNIQUE CHECK(member_number > 0),
  signup_created_at timestamptz NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION protect_member_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Member numbers cannot be reused'; END IF;
  IF NEW.member_number<>OLD.member_number OR NEW.signup_created_at<>OLD.signup_created_at THEN
    RAISE EXCEPTION 'Member numbers and signup order are permanent';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS member_number_permanent ON member_numbers;
CREATE TRIGGER member_number_permanent BEFORE UPDATE OR DELETE ON member_numbers
FOR EACH ROW EXECUTE FUNCTION protect_member_number();

-- One row lock serializes both webhook retries and concurrent signup/login recovery.
-- Reserve legacy regular-member numbers first; Founder numbers are a separate series.
CREATE OR REPLACE FUNCTION reconcile_member_numbers(p_users jsonb)
RETURNS SETOF member_numbers LANGUAGE plpgsql AS $$
DECLARE item record; next_number bigint; assigned_number bigint;
BEGIN
  SELECT last_number INTO next_number FROM member_number_counter WHERE singleton FOR UPDATE;
  FOR item IN SELECT * FROM jsonb_to_recordset(p_users)
    AS u(user_id text, created_at timestamptz, existing_number bigint)
    WHERE existing_number IS NOT NULL ORDER BY created_at,user_id
  LOOP
    IF item.user_id IS NULL OR item.created_at IS NULL OR item.existing_number <= 0 THEN
      RAISE EXCEPTION 'Invalid member-number seed';
    END IF;
    SELECT member_number INTO assigned_number FROM member_numbers WHERE user_id=item.user_id;
    IF assigned_number IS NULL THEN
      INSERT INTO member_numbers(user_id,member_number,signup_created_at)
      VALUES(item.user_id,item.existing_number,item.created_at);
      next_number := GREATEST(next_number,item.existing_number);
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_to_recordset(p_users)
    AS u(user_id text, created_at timestamptz, existing_number bigint) ORDER BY created_at,user_id
  LOOP
    IF item.user_id IS NULL OR item.created_at IS NULL THEN RAISE EXCEPTION 'Invalid signup record'; END IF;
    IF NOT EXISTS(SELECT 1 FROM member_numbers WHERE user_id=item.user_id) THEN
      next_number := next_number+1;
      INSERT INTO member_numbers(user_id,member_number,signup_created_at)
      VALUES(item.user_id,next_number,item.created_at);
    END IF;
  END LOOP;
  UPDATE member_number_counter SET last_number=next_number WHERE singleton;
  RETURN QUERY SELECT n.* FROM member_numbers n JOIN jsonb_array_elements(p_users) u
    ON n.user_id=u->>'user_id' ORDER BY n.member_number;
END;
$$;
