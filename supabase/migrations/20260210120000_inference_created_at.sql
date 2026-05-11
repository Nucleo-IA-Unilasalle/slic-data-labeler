-- Run in Supabase SQL editor or via `supabase db push` if you use the CLI.
-- Ensures inference rows have a server-side timestamp for the UI.

alter table public.inference_calls
  add column if not exists created_at timestamptz default now();

alter table public.inference_observations
  add column if not exists created_at timestamptz default now();
