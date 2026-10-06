CREATE TABLE IF NOT EXISTS member_feedback (
 user_id text NOT NULL, id text NOT NULL, request jsonb NOT NULL,
 member_name text NOT NULL, email text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','planned','resolved')),
 internal_note text NOT NULL DEFAULT '' CHECK(length(internal_note)<=1500),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id), CHECK(jsonb_typeof(request)='object'),
 CHECK(request->>'kind' IN ('problem','suggestion')),
 CHECK(length(request->>'message') BETWEEN 10 AND 2000)
);
CREATE INDEX IF NOT EXISTS member_feedback_queue ON member_feedback(status,created_at DESC);
CREATE INDEX IF NOT EXISTS member_feedback_created ON member_feedback(created_at);
CREATE OR REPLACE FUNCTION submit_member_feedback(p_user text,p_id text,p_request jsonb,p_name text,p_email text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE previous jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('member-feedback:'||p_user,0));
 SELECT request INTO previous FROM member_feedback WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN
  IF previous=p_request THEN RETURN 'saved'; ELSE RETURN 'conflict'; END IF;
 END IF;
 IF (SELECT count(*) FROM member_feedback WHERE user_id=p_user AND created_at>now()-interval '24 hours')>=10 THEN RETURN 'limited'; END IF;
 INSERT INTO member_feedback(user_id,id,request,member_name,email) VALUES(p_user,p_id,p_request,p_name,p_email);
 RETURN 'saved';
END; $$;
