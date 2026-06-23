-- Migration: Add applied_lasers_json to dosage_feedback
alter table public.dosage_feedback
add column if not exists applied_lasers_json jsonb;
