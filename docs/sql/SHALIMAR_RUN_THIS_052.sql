-- SHALIMAR: paste this ENTIRE file into a new Supabase SQL Editor query.
-- Generated from migration 052. Stores no customer data and sends no messages.
-- Adds private import/review tables and account-checked functions.
-- Credentials, Inbox replies, managed delivery and INR 1,000 budget are untouched.
-- Run only in the Shalimar database where migrations 050/051 are installed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.messaging_budget_policies p JOIN public.whatsapp_config c ON c.account_id=p.account_id
      WHERE c.phone_number_id='1391671597361924' AND c.waba_id='28787952197487898'
      AND p.phone_number_id=c.phone_number_id AND p.waba_id=c.waba_id AND p.monthly_limit_paise=100000)<>1 THEN
      RAISE EXCEPTION 'Stopped: this is not the expected Shalimar database / installed INR 1000 policy';
    END IF;
  END $$;
-- Private, account-scoped historical customer imports. No provider calls or consent inference.
CREATE TABLE IF NOT EXISTS public.customer_data_imports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  source_name text NOT NULL CHECK (length(source_name) BETWEEN 1 AND 200),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_start date NOT NULL,
  source_as_of date NOT NULL CHECK (source_as_of >= source_start),
  source_kind text NOT NULL DEFAULT 'historical_csv' CHECK (source_kind = 'historical_csv'),
  row_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  contacts_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, source_sha256), UNIQUE(id, account_id)
);
CREATE TABLE IF NOT EXISTS public.customer_data_rows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_key text NOT NULL CHECK (source_key ~ '^[a-zA-Z0-9:_-]{1,128}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200 AND name !~ '[[:cntrl:]]'),
  raw_phone text NOT NULL CHECK (length(raw_phone) <= 100),
  phone text CHECK (phone ~ '^91[6-9][0-9]{9}$'),
  phone_state text NOT NULL CHECK (phone_state IN ('ready','missing_phone','ambiguous_phone','invalid_phone','shared_phone','duplicate_name','internal_outlet','existing_conflict')),
  first_order date NOT NULL,
  last_order date NOT NULL CHECK (last_order >= first_order),
  orders integer NOT NULL CHECK (orders BETWEEN 1 AND 1000000),
  lifetime_gross_paise bigint NOT NULL CHECK (lifetime_gross_paise BETWEEN 0 AND 99999999999999),
  gross_12m_paise bigint NOT NULL CHECK (gross_12m_paise BETWEEN 0 AND lifetime_gross_paise),
  orders_12m integer NOT NULL CHECK (orders_12m BETWEEN 0 AND orders),
  language text NOT NULL DEFAULT 'unknown' CHECK (language IN ('en','ml','unknown')),
  is_internal boolean NOT NULL DEFAULT false,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  FOREIGN KEY(import_id, account_id) REFERENCES public.customer_data_imports(id, account_id) ON DELETE CASCADE,
  UNIQUE(import_id, source_key)
);
CREATE INDEX IF NOT EXISTS customer_data_import_latest ON public.customer_data_imports(account_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS customer_data_rows_page ON public.customer_data_rows(account_id,import_id,lifetime_gross_paise DESC,id);
CREATE INDEX IF NOT EXISTS customer_data_rows_contact ON public.customer_data_rows(account_id,contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE public.customer_data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_data_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_data_imports_read ON public.customer_data_imports;
CREATE POLICY customer_data_imports_read ON public.customer_data_imports FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.account_id=customer_data_imports.account_id));
DROP POLICY IF EXISTS customer_data_rows_read ON public.customer_data_rows;
CREATE POLICY customer_data_rows_read ON public.customer_data_rows FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.account_id=customer_data_rows.account_id));
REVOKE ALL ON public.customer_data_imports, public.customer_data_rows FROM anon, authenticated;
GRANT SELECT ON public.customer_data_imports, public.customer_data_rows TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_data_name_key(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT regexp_replace(lower(normalize(btrim(p_name), NFKC)), '[^[:alnum:]]', '', 'g');
$$;
CREATE OR REPLACE FUNCTION public.customer_data_phone(p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE d text;
BEGIN
  IF btrim(p_raw) !~ '^\+?[0-9[:space:]()-]+$' THEN RETURN NULL; END IF;
  d := regexp_replace(p_raw,'[^0-9]','','g');
  IF d ~ '^0[6-9][0-9]{9}$' THEN d := substr(d,2); END IF;
  IF d ~ '^[6-9][0-9]{9}$' THEN d := '91'||d; END IF;
  IF d ~ '^91[6-9][0-9]{9}$' THEN RETURN d; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_customer_data_import(
  p_source_name text, p_source_sha256 text, p_source_start date, p_source_as_of date, p_rows jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; run uuid; r jsonb; normalized_phone text; state text; total integer;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin');
  IF a IS NULL THEN RAISE EXCEPTION 'customer_data_admin_required'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'customer_data_invalid_rows'; END IF;
  total := jsonb_array_length(p_rows);
  IF total NOT BETWEEN 1 AND 5000 OR p_source_start IS NULL OR p_source_as_of IS NULL OR p_source_as_of<p_source_start
    OR p_source_as_of>(now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'customer_data_invalid_window'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a::text,52));
  SELECT id INTO run FROM customer_data_imports WHERE account_id=a AND source_sha256=p_source_sha256;
  IF run IS NOT NULL THEN RETURN run; END IF;
  INSERT INTO customer_data_imports(account_id,created_by,source_name,source_sha256,source_start,source_as_of)
    VALUES(a,auth.uid(),p_source_name,p_source_sha256,p_source_start,p_source_as_of) RETURNING id INTO run;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF (r->>'first_order')::date<p_source_start OR (r->>'last_order')::date>p_source_as_of THEN RAISE EXCEPTION 'customer_data_invalid_dates'; END IF;
    normalized_phone := public.customer_data_phone(r->>'raw_phone');
    state := CASE WHEN coalesce((r->>'is_internal')::boolean,false) THEN 'internal_outlet'
      WHEN btrim(r->>'raw_phone')='' THEN 'missing_phone'
      WHEN (r->>'raw_phone') ~ '[,;/|]' THEN 'ambiguous_phone'
      WHEN normalized_phone IS NULL THEN 'invalid_phone' ELSE 'ready' END;
    INSERT INTO customer_data_rows(import_id,account_id,source_key,name,raw_phone,phone,phone_state,first_order,last_order,orders,
      lifetime_gross_paise,gross_12m_paise,orders_12m,language,is_internal)
    VALUES(run,a,r->>'source_key',r->>'name',r->>'raw_phone',normalized_phone,state,(r->>'first_order')::date,(r->>'last_order')::date,(r->>'orders')::integer,
      (r->>'lifetime_gross_paise')::bigint,(r->>'gross_12m_paise')::bigint,(r->>'orders_12m')::integer,coalesce(r->>'language','unknown'),coalesce((r->>'is_internal')::boolean,false));
  END LOOP;
  -- Recompute every quarantine in PostgreSQL; callers cannot assert a row is safe.
  UPDATE customer_data_rows SET phone_state='shared_phone' WHERE import_id=run AND phone_state='ready' AND phone IN
    (SELECT phone FROM customer_data_rows WHERE import_id=run AND phone IS NOT NULL GROUP BY phone HAVING count(*)>1);
  UPDATE customer_data_rows SET phone_state='duplicate_name' WHERE import_id=run AND phone_state='ready' AND public.customer_data_name_key(name) IN
    (SELECT public.customer_data_name_key(name) FROM customer_data_rows WHERE import_id=run GROUP BY public.customer_data_name_key(name) HAVING count(*)>1);
  UPDATE customer_data_imports SET row_count=total, ready_count=(SELECT count(*) FROM customer_data_rows WHERE import_id=run AND phone_state='ready') WHERE id=run;
  RETURN run;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_customer_data_contacts(p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE a uuid; r record; ids uuid[]; target uuid; existing_name text; created_count integer:=0; linked_count integer:=0; conflicts integer:=0;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin');
  IF a IS NULL THEN RAISE EXCEPTION 'customer_data_admin_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a::text,52));
  IF NOT EXISTS(SELECT 1 FROM customer_data_imports WHERE id=p_import_id AND account_id=a) THEN RAISE EXCEPTION 'customer_data_import_not_found'; END IF;
  FOR r IN SELECT * FROM customer_data_rows WHERE account_id=a AND import_id=p_import_id AND phone_state='ready' AND contact_id IS NULL ORDER BY id LOOP
    -- Recognise legacy ten-digit contacts too; do not silently create another copy.
    SELECT array_agg(id) INTO ids FROM contacts WHERE account_id=a AND phone_normalized IN (r.phone,substr(r.phone,3));
    IF coalesce(array_length(ids,1),0)>1 THEN
      UPDATE customer_data_rows SET phone_state='existing_conflict' WHERE id=r.id; conflicts:=conflicts+1; CONTINUE;
    END IF;
    IF coalesce(array_length(ids,1),0)=1 THEN
      target:=ids[1]; SELECT name INTO existing_name FROM contacts WHERE id=target AND account_id=a;
      IF public.customer_data_name_key(coalesce(existing_name,'')) <> public.customer_data_name_key(r.name) THEN
        UPDATE customer_data_rows SET phone_state='existing_conflict' WHERE id=r.id; conflicts:=conflicts+1; CONTINUE;
      END IF;
    ELSE
      target:=NULL;
      INSERT INTO contacts(account_id,user_id,phone,name) VALUES(a,auth.uid(),r.phone,r.name)
        ON CONFLICT (account_id,phone_normalized) WHERE phone_normalized <> '' DO NOTHING RETURNING id INTO target;
      IF target IS NULL THEN
        -- A different writer won the unique-phone race. Recheck identity before linking.
        SELECT id,name INTO target,existing_name FROM contacts WHERE account_id=a AND phone_normalized=r.phone;
        IF public.customer_data_name_key(coalesce(existing_name,'')) <> public.customer_data_name_key(r.name) THEN
          UPDATE customer_data_rows SET phone_state='existing_conflict' WHERE id=r.id; conflicts:=conflicts+1; CONTINUE;
        END IF;
      ELSE created_count:=created_count+1; END IF;
    END IF;
    UPDATE customer_data_rows SET contact_id=target WHERE id=r.id AND account_id=a;
    linked_count:=linked_count+1;
  END LOOP;
  UPDATE customer_data_imports SET contacts_published_at=now(),
    ready_count=(SELECT count(*) FROM customer_data_rows WHERE import_id=p_import_id AND phone_state='ready')
    WHERE id=p_import_id AND account_id=a;
  RETURN jsonb_build_object('created',created_count,'linked',linked_count,'conflicts',conflicts,
    'total_linked',(SELECT count(*) FROM customer_data_rows WHERE import_id=p_import_id AND account_id=a AND contact_id IS NOT NULL));
  -- Deliberately never creates consent rows, clears suppression or sends messages.
END;
$$;

CREATE OR REPLACE FUNCTION public.review_customer_data_row(p_row_id uuid,p_language text,p_permission jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE a uuid; r record; status text; observed timestamptz;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin');
  IF a IS NULL THEN RAISE EXCEPTION 'customer_data_admin_required'; END IF;
  IF p_language IS NULL OR p_language NOT IN ('en','ml','unknown') THEN RAISE EXCEPTION 'customer_data_invalid_language'; END IF;
  SELECT * INTO r FROM customer_data_rows WHERE id=p_row_id AND account_id=a FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'customer_data_row_not_found'; END IF;
  IF p_permission IS NOT NULL THEN
    status:=p_permission->>'status'; observed:=(p_permission->>'observed_at')::timestamptz;
    IF status IS NULL OR status NOT IN ('opted_in','opted_out') OR observed IS NULL OR NOT isfinite(observed) OR observed>now() THEN RAISE EXCEPTION 'customer_data_invalid_permission'; END IF;
    IF r.contact_id IS NULL OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=r.contact_id AND account_id=a) THEN RAISE EXCEPTION 'customer_data_contact_not_linked'; END IF;
    IF EXISTS(SELECT 1 FROM contact_consents WHERE account_id=a AND contact_id=r.contact_id AND channel='whatsapp' AND category='marketing'
      AND greatest(consented_at,revoked_at)>observed) THEN RAISE EXCEPTION 'customer_data_invalid_older_permission'; END IF;
    IF length(btrim(coalesce(p_permission->>'source',''))) NOT BETWEEN 3 AND 300
      OR length(btrim(coalesce(p_permission->>'wording',''))) NOT BETWEEN 10 AND 1000
      OR length(btrim(coalesce(p_permission->>'evidence',''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'customer_data_permission_evidence_required'; END IF;
    INSERT INTO contact_consents(account_id,contact_id,channel,category,status,source,wording_version,consented_at,revoked_at,evidence)
    VALUES(a,r.contact_id,'whatsapp','marketing',status,p_permission->>'source','shalimar_customer_data_permission_v1',
      CASE WHEN status='opted_in' THEN observed END,CASE WHEN status='opted_out' THEN observed END,
      jsonb_build_object('wording',p_permission->>'wording','detail',p_permission->>'evidence','recorded_by',auth.uid(),'recorded_at',now(),'customer_data_row',r.id))
    ON CONFLICT(account_id,contact_id,channel,category) DO UPDATE SET status=excluded.status,source=excluded.source,
      wording_version=excluded.wording_version,consented_at=excluded.consented_at,revoked_at=excluded.revoked_at,evidence=excluded.evidence,updated_at=now();
    IF status='opted_out' THEN UPDATE contacts SET suppressed_at=coalesce(suppressed_at,now()) WHERE id=r.contact_id AND account_id=a; END IF;
    -- A recorded opt-in does not clear an existing global opt-out/suppression.
  END IF;
  UPDATE customer_data_rows SET language=p_language WHERE id=r.id AND account_id=a;
END;
$$;

-- Read status without broadening the existing agent-only consent/evidence RLS.
CREATE OR REPLACE FUNCTION public.customer_data_permission_status(p_contact_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE a uuid; result jsonb;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin','agent','viewer');
  IF a IS NULL THEN RAISE EXCEPTION 'customer_data_member_required'; END IF;
  IF coalesce(array_length(p_contact_ids,1),0)>100 THEN RAISE EXCEPTION 'customer_data_invalid_filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('contact_id',c.id,'status',
    CASE WHEN c.suppressed_at IS NOT NULL THEN 'opted_out'
      WHEN s.status='opted_in' AND (s.consented_at IS NULL OR s.consented_at>now() OR btrim(s.source)='' OR btrim(s.wording_version)='') THEN 'evidence_missing'
      ELSE coalesce(s.status,'unknown') END)),'[]') INTO result
    FROM contacts c LEFT JOIN contact_consents s ON s.account_id=a AND s.contact_id=c.id AND s.channel='whatsapp' AND s.category='marketing'
    WHERE c.account_id=a AND c.id=ANY(p_contact_ids) AND EXISTS(SELECT 1 FROM customer_data_rows r WHERE r.account_id=a AND r.contact_id=c.id);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_customer_data_audience(p_import_id uuid,p_preset text,p_language text,p_exclude_tag_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE a uuid; result jsonb;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin','agent','viewer');
  IF a IS NULL THEN RAISE EXCEPTION 'customer_data_member_required'; END IF;
  IF p_preset IS NULL OR p_preset NOT IN ('all_reviewed','high_value_frequent','high_value_at_risk','low_value_one_time') THEN RAISE EXCEPTION 'customer_data_unsupported_preset'; END IF;
  IF p_language IS NULL OR p_language NOT IN ('en','ml') OR coalesce(array_length(p_exclude_tag_ids,1),0)>100 THEN RAISE EXCEPTION 'customer_data_invalid_filter'; END IF;
  IF NOT EXISTS(SELECT 1 FROM customer_data_imports WHERE id=p_import_id AND account_id=a) THEN RAISE EXCEPTION 'customer_data_import_not_found'; END IF;
  IF p_preset IN ('high_value_frequent','high_value_at_risk') AND EXISTS(
    SELECT 1 FROM customer_data_imports WHERE id=p_import_id AND account_id=a AND source_start>source_as_of-interval '1 year'
  ) THEN RAISE EXCEPTION 'customer_data_invalid_short_coverage'; END IF;
  WITH classified AS (
    SELECT r.id,r.contact_id, CASE
      WHEN r.phone_state<>'ready' OR r.is_internal THEN 'phone_review'
      WHEN c.id IS NULL THEN 'not_linked'
      WHEN c.suppressed_at IS NOT NULL THEN 'opted_out'
      WHEN public.customer_data_phone(c.phone) IS DISTINCT FROM r.phone OR public.customer_data_name_key(coalesce(c.name,''))<>public.customer_data_name_key(r.name) THEN 'contact_changed'
      WHEN regexp_replace(c.phone,'[^0-9]','','g')<>r.phone THEN 'contact_number_format'
      WHEN p_preset='high_value_frequent' AND NOT(r.gross_12m_paise>=5000000 AND r.orders_12m>=4) THEN 'outside_segment'
      WHEN p_preset='high_value_at_risk' AND NOT(r.gross_12m_paise>=5000000 AND i.source_as_of-r.last_order>=90) THEN 'outside_segment'
      WHEN p_preset='low_value_one_time' AND NOT(r.orders=1 AND r.lifetime_gross_paise<=1000000) THEN 'outside_segment'
      WHEN r.language='unknown' THEN 'language_unknown'
      WHEN r.language<>p_language THEN 'other_language'
      WHEN consent.status IS DISTINCT FROM 'opted_in' OR consent.consented_at IS NULL OR consent.consented_at>now()
        OR btrim(consent.source)='' OR btrim(consent.wording_version)='' THEN 'permission_missing'
      WHEN EXISTS(SELECT 1 FROM contact_tags ct JOIN tags t ON t.id=ct.tag_id AND t.account_id=a
        WHERE ct.contact_id=c.id AND ct.tag_id=ANY(p_exclude_tag_ids)) THEN 'excluded_tag'
      ELSE 'eligible' END AS reason
    FROM customer_data_rows r JOIN customer_data_imports i ON i.id=r.import_id AND i.account_id=a
    LEFT JOIN contacts c ON c.id=r.contact_id AND c.account_id=a
    LEFT JOIN contact_consents consent ON consent.contact_id=c.id AND consent.account_id=a AND consent.channel='whatsapp' AND consent.category='marketing'
    WHERE r.account_id=a AND r.import_id=p_import_id
  )
  SELECT jsonb_build_object('total',count(*),'eligible',count(*) FILTER(WHERE reason='eligible'),
    'excluded',count(*) FILTER(WHERE reason<>'eligible'),
    'reasons',coalesce((SELECT jsonb_object_agg(reason,n) FROM(SELECT reason,count(*) AS n FROM classified WHERE reason<>'eligible' GROUP BY reason) counts),'{}'),
    'contacts',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM contacts c JOIN classified s ON s.contact_id=c.id AND s.reason='eligible' WHERE c.account_id=a),'[]')) INTO result
  FROM classified;
  RETURN result || (SELECT jsonb_build_object('import_id',id,'source_sha256',source_sha256,'source_as_of',source_as_of,'source_start',source_start,'source_kind',source_kind,
    'segment_rules','High value: INR 50,000+ in source trailing 12 months; frequent: 4+ orders; at risk: 90+ days before source date; low one-time: INR 10,000 or less, 1 order') FROM customer_data_imports WHERE id=p_import_id AND account_id=a);
END;
$$;

REVOKE ALL ON FUNCTION public.save_customer_data_import(text,text,date,date,jsonb), public.publish_customer_data_contacts(uuid), public.review_customer_data_row(uuid,text,jsonb), public.customer_data_permission_status(uuid[]), public.preview_customer_data_audience(uuid,text,text,uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_customer_data_import(text,text,date,date,jsonb), public.publish_customer_data_contacts(uuid), public.review_customer_data_row(uuid,text,jsonb), public.customer_data_permission_status(uuid[]), public.preview_customer_data_audience(uuid,text,text,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';

SELECT '052 installed' AS migration, 'Private customer imports ready' AS customer_data,
    p.monthly_limit_paise/100 AS monthly_limit_inr,
    CASE WHEN p.enabled THEN 'ON - saved campaign approval still required' ELSE 'OFF' END AS managed_delivery,
    'Existing Contacts, credentials and Inbox replies unchanged' AS connection,
    'Upload the prepared CSV in Contacts > Customer Data, then review numbers, language and permission' AS next_step
    FROM public.messaging_budget_policies p WHERE p.phone_number_id='1391671597361924' AND p.waba_id='28787952197487898';
COMMIT;
