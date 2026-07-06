@echo off
cd /d "%~dp0"
set NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder
set NEXT_PUBLIC_DOSAGE_DEMO_MODE=1
start "" http://localhost:3000/dosage-supervision
pnpm run dev
