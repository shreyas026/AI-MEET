-- ============ Otter-style features: transcript segments, chat chunks, full-text search ============

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Transcript segments (timestamped, speaker-labeled, editable — powers transcript viewer + audio sync)
CREATE TABLE public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  start_seconds DOUBLE PRECISION,
  end_seconds DOUBLE PRECISION,
  speaker TEXT,
  content TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcript_segments TO authenticated;
GRANT ALL ON public.transcript_segments TO service_role;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ts_segments_meeting ON public.transcript_segments(meeting_id);
CREATE INDEX idx_ts_segments_ws ON public.transcript_segments(workspace_id);

CREATE POLICY "transcript_segments ws access" ON public.transcript_segments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Transcript chunks with embeddings (power RAG-style "Ask about this meeting")
CREATE TABLE public.transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcript_chunks TO authenticated;
GRANT ALL ON public.transcript_chunks TO service_role;
ALTER TABLE public.transcript_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tc_chunks_meeting ON public.transcript_chunks(meeting_id);
CREATE INDEX idx_tc_chunks_ws ON public.transcript_chunks(workspace_id);
CREATE INDEX idx_tc_chunks_embedding ON public.transcript_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE POLICY "transcript_chunks ws access" ON public.transcript_chunks FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Snippet helper for transcript search results
CREATE OR REPLACE FUNCTION public.highlight_snippet(_haystack TEXT, _needle TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _needle = '' OR _haystack IS NULL THEN LEFT(_haystack, 300)
    ELSE
      LEFT(
        substring(_haystack from greatest(1, position(lower(_needle) in lower(_haystack)) - 80) for 220),
        300
      )
  END;
$$;

-- Full-text search across transcripts
CREATE OR REPLACE FUNCTION public.search_transcripts(
  _ws UUID,
  _q TEXT,
  _limit INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  snippet TEXT,
  meeting_id UUID,
  meeting_title TEXT,
  created_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id,
    t.content,
    public.highlight_snippet(t.content, _q) AS snippet,
    t.meeting_id,
    m.title AS meeting_title,
    t.created_at,
    similarity(_q, t.content) AS sim
  FROM public.transcripts t
  JOIN public.meetings m ON m.id = t.meeting_id
  WHERE t.workspace_id = _ws
    AND public.is_workspace_member(_ws, auth.uid())
    AND (t.content ILIKE '%' || _q || '%' OR _q = '')
  ORDER BY sim DESC NULLS LAST, t.created_at DESC
  LIMIT _limit;
$$;

-- Semantic search over transcript chunks (RAG for "ask about this meeting")
CREATE OR REPLACE FUNCTION public.search_transcript_chunks(
  _meeting UUID,
  _ws UUID,
  _embedding vector(1536),
  _limit INT DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  seq INT,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.content, c.seq, 1 - (c.embedding <=> _embedding) AS similarity
  FROM public.transcript_chunks c
  WHERE c.meeting_id = _meeting
    AND c.workspace_id = _ws
    AND public.is_workspace_member(_ws, auth.uid())
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> _embedding
  LIMIT _limit;
$$;

-- Search decisions + action items by keyword (dashboard-level search)
CREATE OR REPLACE FUNCTION public.search_workspace_content(
  _ws UUID,
  _q TEXT,
  _limit INT DEFAULT 15
)
RETURNS TABLE (
  kind TEXT,
  id UUID,
  title TEXT,
  snippet TEXT,
  meeting_id UUID,
  meeting_title TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'decision' AS kind, d.id, d.statement AS title,
         public.highlight_snippet(d.statement, _q) AS snippet,
         d.meeting_id, m.title AS meeting_title, d.created_at
  FROM public.decisions d
  JOIN public.meetings m ON m.id = d.meeting_id
  WHERE d.workspace_id = _ws AND public.is_workspace_member(_ws, auth.uid())
    AND (d.statement ILIKE '%' || _q || '%' OR d.tags::text ILIKE '%' || _q || '%' OR _q = '')
  UNION ALL
  SELECT 'action_item' AS kind, a.id, a.title,
         public.highlight_snippet(COALESCE(a.description, a.title), _q) AS snippet,
         a.meeting_id, m.title AS meeting_title, a.created_at
  FROM public.action_items a
  JOIN public.meetings m ON m.id = a.meeting_id
  WHERE a.workspace_id = _ws AND public.is_workspace_member(_ws, auth.uid())
    AND (a.title ILIKE '%' || _q || '%' OR COALESCE(a.description,'') ILIKE '%' || _q || '%' OR _q = '')
  ORDER BY created_at DESC
  LIMIT _limit;
$$;

CREATE INDEX idx_transcripts_trgm ON public.transcripts USING gin (content gin_trgm_ops);
CREATE INDEX idx_decisions_trgm ON public.decisions USING gin (statement gin_trgm_ops, tags gin_trgm_ops);
CREATE INDEX idx_action_items_trgm ON public.action_items USING gin (title gin_trgm_ops);