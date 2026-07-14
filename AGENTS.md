# AI Meeting Operator — Agent Notes

This is a standalone TanStack Start (React + SSR) application. It uses:

- **TanStack Start** for routing and server functions
- **Supabase** (official `@supabase/supabase-js` SDK) for auth, database, and storage
- **Gemini API** (direct fetch, no SDK) for transcription, chat completions, and embeddings
- **Tailwind CSS v4** + shadcn/ui components
- **TanStack Query** for client-side data fetching

## Environment variables required

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
```

## Development

```bash
cd frontend
npm install
npm run dev
```

## Architecture

- `frontend/src/routes/` — file-based routes (TanStack Router)
- `frontend/src/lib/*.functions.ts` — server functions (RPC layer)
- `frontend/src/lib/gemini.server.ts` — Gemini helpers (server-only)
- `frontend/src/integrations/supabase/` — Supabase client, auth middleware
- `backend/supabase/migrations/` — database schema
