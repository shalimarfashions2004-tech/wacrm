-- Account-scoped Tally identity decisions. New-shop Tally data is kept separate
-- from the historical customer_data_imports reconciliation path.
CREATE TABLE IF NOT EXISTS public.tally_identity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ledger_source_id text NOT NULL CHECK (length(btrim(ledger_source_id)) BETWEEN 1 AND 200),
  source_scope text NOT NULL DEFAULT 'new_shop_tally' CHECK (source_scope = 'new_shop_tally'),
  ledger_name text NOT NULL CHECK (length(btrim(ledger_name)) BETWEEN 1 AND 200),
  ledger_phone text,
  normalized_phone text CHECK (normalized_phone IS NULL OR normalized_phone ~ '^91[6-9][0-9]{9}$'),
  status text NOT NULL CHECK (status IN ('auto_matched','manual_review','blocked','resolved')),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, account_id, ledger_source_id),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tally_identity_matches_queue ON public.tally_identity_matches(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tally_identity_matches_contact ON public.tally_identity_matches(account_id, contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE public.tally_identity_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tally_identity_matches_read ON public.tally_identity_matches;
CREATE POLICY tally_identity_matches_read ON public.tally_identity_matches
  FOR SELECT TO authenticated USING (is_account_member(account_id));
REVOKE INSERT, UPDATE, DELETE ON public.tally_identity_matches FROM authenticated, anon;
GRANT SELECT ON public.tally_identity_matches TO authenticated;

-- The intake/service process may enqueue a decision, but cannot create one for
-- another account. This function never writes contact_consents or suppression.
CREATE OR REPLACE FUNCTION public.queue_tally_identity_match(
  p_run_id uuid, p_ledger_source_id text, p_ledger_name text, p_ledger_phone text,
  p_normalized_phone text, p_status text, p_contact_id uuid, p_evidence jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; match_id uuid;
BEGIN
  SELECT account_id INTO a FROM public.tally_sync_runs WHERE id = p_run_id;
  IF a IS NULL OR p_status NOT IN ('auto_matched','manual_review','blocked')
    OR p_ledger_source_id IS NULL OR p_ledger_name IS NULL THEN RAISE EXCEPTION 'tally_identity_invalid'; END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_contact_id AND account_id=a) THEN RAISE EXCEPTION 'tally_identity_contact_mismatch'; END IF;
  INSERT INTO public.tally_identity_matches(run_id,account_id,ledger_source_id,ledger_name,ledger_phone,normalized_phone,status,contact_id,evidence)
  VALUES(p_run_id,a,p_ledger_source_id,p_ledger_name,p_ledger_phone,p_normalized_phone,p_status,p_contact_id,coalesce(p_evidence,'[]'::jsonb))
  ON CONFLICT(run_id,account_id,ledger_source_id) DO UPDATE SET ledger_name=excluded.ledger_name, ledger_phone=excluded.ledger_phone,
    normalized_phone=excluded.normalized_phone, status=excluded.status, contact_id=excluded.contact_id, evidence=excluded.evidence
  RETURNING id INTO match_id;
  RETURN match_id;
END; $$;
REVOKE ALL ON FUNCTION public.queue_tally_identity_match(uuid,text,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_tally_identity_match(uuid,text,text,text,text,text,uuid,jsonb) TO service_role;

-- Only owners/admins can resolve a queued identity, and only to a contact in
-- the same account. Resolution is an identity link, never consent.
CREATE OR REPLACE FUNCTION public.resolve_tally_identity_match(p_match_id uuid, p_contact_id uuid)
RETURNS public.tally_identity_matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; result public.tally_identity_matches;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin');
  IF a IS NULL THEN RAISE EXCEPTION 'tally_identity_admin_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_contact_id AND account_id=a) THEN RAISE EXCEPTION 'tally_identity_contact_mismatch'; END IF;
  UPDATE public.tally_identity_matches SET contact_id=p_contact_id,status='resolved',resolved_by=auth.uid(),resolved_at=now()
    WHERE id=p_match_id AND account_id=a AND status IN ('manual_review','blocked') RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'tally_identity_review_not_found'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_tally_identity_match(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tally_identity_match(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
