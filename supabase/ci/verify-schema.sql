-- Post-migration assertions for the CI job in
-- `.github/workflows/migrations.yml`.
--
-- `supabase db reset` already fails on any statement Postgres rejects,
-- so this is not about syntax. It's about the quieter failure: a
-- migration that applies cleanly and does nothing. Every DDL statement
-- in this repo is guarded with IF NOT EXISTS / ON CONFLICT so the files
-- can be re-run safely, and that same guard turns a typo'd object name
-- into a silent no-op with a green checkmark.
--
-- Keep this thin. It is a smoke test for "did the migrations actually
-- build the schema", not a spec of it — asserting every column here
-- would just be the migrations restated in a second place, drifting.
DO $$
BEGIN
  -- The core tables, from 001.
  IF to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION 'public.messages is missing — migrations did not apply';
  END IF;
  IF to_regclass('public.whatsapp_config') IS NULL THEN
    RAISE EXCEPTION 'public.whatsapp_config is missing — migrations did not apply';
  END IF;

  -- Supabase provides the storage schema; migrations 016/020/023 write
  -- to it. If it is absent the bucket migrations silently accomplish
  -- nothing, which is precisely the case a plain "no errors" run hides.
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION
      'storage.buckets is missing — the storage schema was not available when the bucket migrations ran';
  END IF;

  -- Buckets are UPSERTed, so their absence means the INSERT never ran.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media') THEN
    RAISE EXCEPTION 'the chat-media bucket row was not created (migration 023)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'flow-media') THEN
    RAISE EXCEPTION 'the flow-media bucket row was not created (migration 016)';
  END IF;

  -- Account scoping (017) is load-bearing for every RLS policy.
  IF to_regclass('public.accounts') IS NULL THEN
    RAISE EXCEPTION 'public.accounts is missing — migration 017 did not apply';
  END IF;

  -- Invitation links need both RPCs. The table alone is insufficient: the
  -- public join page calls peek anonymously and redeem runs as the caller.
  IF to_regprocedure('public.peek_invitation(text)') IS NULL THEN
    RAISE EXCEPTION 'peek_invitation(text) is missing — migration 019/048 did not apply';
  END IF;
  IF to_regprocedure('public.redeem_invitation(text)') IS NULL THEN
    RAISE EXCEPTION 'redeem_invitation(text) is missing — migration 019/048 did not apply';
  END IF;
  IF NOT has_function_privilege('anon', 'public.peek_invitation(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute peek_invitation(text)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.redeem_invitation(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute redeem_invitation(text)';
  END IF;

  -- The BSUID index (040) is the only thing stopping a username-only
  -- WhatsApp sender from forking a new contact per inbound message. A
  -- typo in its name would apply cleanly and guarantee nothing.
  IF to_regclass('public.idx_contacts_account_wa_user_id') IS NULL THEN
    RAISE EXCEPTION
      'idx_contacts_account_wa_user_id is missing — migration 040 did not apply';
  END IF;

  -- 041 repairs create_broadcast_with_recipients, which 037/038 shipped
  -- with an ambiguous bare `RETURNING id, contact_id` (SQLSTATE 42702 on
  -- first call — plpgsql resolves names at execution, not CREATE, so a
  -- plain replay can't catch it). Assert the qualified form is what's
  -- actually installed.
  IF pg_get_functiondef(
       'public.create_broadcast_with_recipients(uuid,uuid,text,text,text,integer,uuid[],jsonb[])'::regprocedure
     ) NOT LIKE '%RETURNING id, broadcast_recipients.contact_id%' THEN
    RAISE EXCEPTION
      'create_broadcast_with_recipients still has the ambiguous RETURNING — migration 041 did not apply';
  END IF;

  -- The failure-reason columns (042) are only ever written by the
  -- status webhook, which uses an untyped update — a missing column
  -- there is a runtime PostgREST error on every failed send, not a
  -- compile error.
  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name IN ('error_code', 'error_title', 'error_details')
  ) <> 3 THEN
    RAISE EXCEPTION
      'messages.error_code/error_title/error_details are missing — migration 042 did not apply';
  END IF;

  -- Consent and delivery safety (043/044). These are the controls that make
  -- the campaign preflight fail closed instead of treating every imported
  -- phone number as permission to message.
  IF to_regclass('public.contact_consents') IS NULL THEN
    RAISE EXCEPTION 'contact_consents is missing — migrations 043/044 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.contact_consents'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'contact_consents RLS is disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_consents'
      AND policyname = 'Account members manage contact consent'
  ) THEN
    RAISE EXCEPTION 'contact_consents account policy is missing';
  END IF;

  -- Notifications are a core dashboard dependency. A missing table turns
  -- the whole notifications route into a schema-cache error.
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'notifications is missing — migrations 027/047 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.notifications'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'notifications RLS is disabled';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name IN ('suppressed_at', 'suppression_reason')
  ) <> 2 THEN
    RAISE EXCEPTION 'contacts suppression columns are missing — migration 043/044 did not apply';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'broadcast_recipients'
      AND column_name IN (
        'idempotency_key', 'attempt_count', 'suppressed_reason',
        'provider_message_id', 'cost_inr', 'template_params'
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'broadcast recipient safety/resume columns are missing — migrations 038/043/046 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'idx_broadcast_recipient_idempotency'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'broadcast recipient idempotency index is missing — migration 043 did not apply';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'broadcasts'
      AND column_name IN (
        'delivery_mode', 'approval_status', 'estimated_cost_inr',
        'budget_snapshot_inr', 'provider_name', 'delivery_locked_at'
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'broadcast delivery/budget/resume columns are missing — migrations 038/043/046 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'idx_broadcast_recipients_broadcast_status'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'broadcast status index is missing — migration 038/046 did not apply';
  END IF;
  IF pg_get_functiondef(
       'public.create_broadcast_with_recipients(uuid,uuid,text,text,text,integer,uuid[],jsonb[])'::regprocedure
     ) NOT LIKE '%idempotency_key%' THEN
    RAISE EXCEPTION 'broadcast creation function does not assign idempotency keys — migration 043 did not apply';
  END IF;

  -- Interactive messaging and AI settings are loaded by the settings and
  -- inbox routes. A missing object becomes a schema-cache error on every
  -- dashboard visit, so keep the production reconciliation in CI.
  IF to_regclass('public.quick_replies') IS NULL THEN
    RAISE EXCEPTION 'quick_replies is missing — migration 035/049 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.quick_replies'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'quick_replies RLS is disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quick_replies'
      AND policyname = 'quick_replies_select'
  ) THEN
    RAISE EXCEPTION 'quick_replies account policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_configs'
      AND column_name = 'handoff_agent_id'
  ) THEN
    RAISE EXCEPTION 'ai_configs.handoff_agent_id is missing — migration 033/045/049 did not apply';
  END IF;
  IF to_regclass('public.ai_usage_log') IS NULL THEN
    RAISE EXCEPTION 'ai_usage_log is missing — migration 033/049 did not apply';
  END IF;
  IF to_regclass('public.ai_knowledge_documents') IS NULL
     OR to_regclass('public.ai_knowledge_chunks') IS NULL THEN
    RAISE EXCEPTION 'AI knowledge tables are missing — migration 030/049 did not apply';
  END IF;

  -- Protected budget/approval/attempt records. Browser-side approval fields
  -- are not an authority, and even service-role direct writes must be denied.
  IF to_regclass('public.messaging_budget_policies') IS NULL
    OR to_regclass('public.messaging_source_approvals') IS NULL
    OR to_regclass('public.messaging_delivery_ledger') IS NULL THEN
    RAISE EXCEPTION 'managed messaging tables are missing — migration 050 did not apply';
  END IF;
  IF (SELECT COUNT(*) FROM pg_class WHERE oid IN (
    'public.messaging_budget_policies'::regclass,
    'public.messaging_source_approvals'::regclass,
    'public.messaging_delivery_ledger'::regclass) AND relrowsecurity) <> 3 THEN
    RAISE EXCEPTION 'managed messaging RLS is disabled';
  END IF;
  IF has_table_privilege('authenticated', 'public.messaging_source_approvals', 'UPDATE')
    OR has_table_privilege('service_role', 'public.messaging_delivery_ledger', 'INSERT')
    OR has_table_privilege('authenticated', 'public.messaging_budget_policies', 'UPDATE') THEN
    RAISE EXCEPTION 'managed messaging controls allow direct writes';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.claim_messaging_delivery(uuid,text,uuid,uuid,text,text,uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
    'public.claim_messaging_delivery(uuid,text,uuid,uuid,text,text,uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon',
    'public.approve_messaging_source(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'managed messaging RPC grants are incorrect';
  END IF;

  IF to_regprocedure('public.read_messaging_source(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.read_messaging_budget(uuid)') IS NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_logs' AND column_name='messaging_fingerprint') THEN
    RAISE EXCEPTION 'managed runtime is missing — migration 051 did not apply';
  END IF;
  IF has_function_privilege('authenticated', 'public.read_messaging_source(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.read_messaging_source(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.read_messaging_budget(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'managed runtime grants are incorrect';
  END IF;
  RAISE NOTICE 'schema verification passed';
END
$$;

-- Two things this file has already been burned by, both verified in CI
-- rather than assumed:
--
-- 1. It must contain EXACTLY ONE statement. `supabase db query --file`
--    sends the whole file as a prepared statement, and a second
--    top-level statement fails with the distinctly unhelpful "cannot
--    insert multiple commands into a prepared statement" (commit
--    f91a6c8). Add assertions INSIDE the DO block above; do not append
--    a second one.
--
-- 2. A RAISE in here really does fail the job. A deliberately false
--    assertion (commit 42c7db0, run 31579334056) surfaced as
--    `failed to execute query: error: ...` and exited 1. This is not a
--    decorative green tick.
