-- 049_production_schema_reconciliation.sql
--
-- Reconcile the interactive messaging and AI objects used by the current
-- dashboard. This migration is additive and safe to replay on an older
-- production database; it preserves existing rows and re-applies the
-- account-scoped policies that protect each tenant's data.

-- Interactive messages / quick replies (035).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS interactive_payload JSONB;

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'interactive')),
  content_text TEXT,
  interactive_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account
  ON quick_replies(account_id);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quick_replies_select ON quick_replies;
DROP POLICY IF EXISTS quick_replies_insert ON quick_replies;
DROP POLICY IF EXISTS quick_replies_update ON quick_replies;
DROP POLICY IF EXISTS quick_replies_delete ON quick_replies;
CREATE POLICY quick_replies_select ON quick_replies FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY quick_replies_insert ON quick_replies FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY quick_replies_update ON quick_replies FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY quick_replies_delete ON quick_replies FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON quick_replies;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- AI reply assistant and usage logging (033/045).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS handoff_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS embeddings_api_key TEXT;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_handoff_summary TEXT;

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto_reply', 'draft')),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_account_created
  ON ai_usage_log(account_id, created_at DESC);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_log_select ON ai_usage_log;
CREATE POLICY ai_usage_log_select ON ai_usage_log FOR SELECT
  USING (is_account_member(account_id, 'admin'));

-- AI knowledge base (030/032). The vector extension is already enabled on
-- Supabase for this project; IF NOT EXISTS keeps this safe on replays.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_documents_account_id_idx
  ON ai_knowledge_documents(account_id);
ALTER TABLE ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_knowledge_documents_select ON ai_knowledge_documents;
DROP POLICY IF EXISTS ai_knowledge_documents_insert ON ai_knowledge_documents;
DROP POLICY IF EXISTS ai_knowledge_documents_update ON ai_knowledge_documents;
DROP POLICY IF EXISTS ai_knowledge_documents_delete ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_select ON ai_knowledge_documents FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY ai_knowledge_documents_insert ON ai_knowledge_documents FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY ai_knowledge_documents_update ON ai_knowledge_documents FOR UPDATE
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY ai_knowledge_documents_delete ON ai_knowledge_documents FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.update_ai_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ai_knowledge_documents_updated_at ON ai_knowledge_documents;
CREATE TRIGGER ai_knowledge_documents_updated_at
  BEFORE UPDATE ON ai_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_knowledge_documents_updated_at();

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_account_id_idx
  ON ai_knowledge_chunks(account_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_document_id_idx
  ON ai_knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx
  ON ai_knowledge_chunks USING GIN(fts);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_idx
  ON ai_knowledge_chunks USING hnsw(embedding vector_cosine_ops);
ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_knowledge_chunks_select ON ai_knowledge_chunks;
DROP POLICY IF EXISTS ai_knowledge_chunks_insert ON ai_knowledge_chunks;
DROP POLICY IF EXISTS ai_knowledge_chunks_update ON ai_knowledge_chunks;
DROP POLICY IF EXISTS ai_knowledge_chunks_delete ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_select ON ai_knowledge_chunks FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY ai_knowledge_chunks_insert ON ai_knowledge_chunks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY ai_knowledge_chunks_update ON ai_knowledge_chunks FOR UPDATE
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY ai_knowledge_chunks_delete ON ai_knowledge_chunks FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- SECURITY INVOKER is deliberate: authenticated callers stay inside the
-- account policy, while service_role can still retrieve its own tenant data.
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id UUID,
  p_query TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, rank REAL) AS $$
  SELECT c.id, c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id UUID,
  p_query_embedding TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, distance REAL) AS $$
  SELECT c.id, c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(UUID, TEXT, INTEGER) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(UUID, TEXT, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
