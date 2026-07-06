create table if not exists public.dosage_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  "user" text not null,
  image_name text not null,
  presentation_mode text not null check (presentation_mode in ('blind', 'context', 'suggestion_review')),
  assignment_sequence integer not null,
  decision_category text,
  dose_range text,
  custom_dose text,
  wavelength text,
  accepted_suggestion boolean,
  edited_fields jsonb,
  shown_context jsonb,
  shown_suggestion jsonb,
  dosage_obs text,
  skipped boolean not null default false,
  constraint dosage_feedback_user_image_mode_unique unique ("user", image_name, presentation_mode),
  constraint dosage_feedback_user_sequence_unique unique ("user", assignment_sequence)
);

create index if not exists dosage_feedback_user_image_idx
  on public.dosage_feedback ("user", image_name);

create index if not exists dosage_feedback_user_sequence_idx
  on public.dosage_feedback ("user", assignment_sequence);

create index if not exists dosage_feedback_user_mode_idx
  on public.dosage_feedback ("user", presentation_mode);

create index if not exists dosage_feedback_image_idx
  on public.dosage_feedback (image_name);
