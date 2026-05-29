-- ============================================================
-- Fraternity Grade Portal — Additive Migrations
-- Run this in the Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- ── Performance Indexes ──────────────────────────────────────
-- These speed up the most common queries as membership grows.

-- Dashboard load: member's submissions across semesters
CREATE INDEX IF NOT EXISTS idx_submissions_member_semester
  ON public.submissions(member_id, semester_id);

-- Duplicate detection: perceptual hash lookup on every new upload
CREATE INDEX IF NOT EXISTS idx_submissions_phash
  ON public.submissions(photo_phash)
  WHERE photo_phash IS NOT NULL;

-- Round-scoped submission lookups
CREATE INDEX IF NOT EXISTS idx_submissions_round_id
  ON public.submissions(round_id)
  WHERE round_id IS NOT NULL;

-- Email rate-limit + dedup check (fires on every reminder send)
CREATE INDEX IF NOT EXISTS idx_email_logs_dedup
  ON public.email_logs(semester_id, member_id, type, sent_at);

-- Compliance board query: all submissions for a semester
CREATE INDEX IF NOT EXISTS idx_submissions_semester_status
  ON public.submissions(semester_id, status);


-- ── email_logs: add failure tracking columns ─────────────────
-- Allows the app to log failed email sends to the DB instead of
-- only to ephemeral Vercel function logs.

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS error_message text;


-- ── Invite code support ───────────────────────────────────────
-- chapter_settings stores the signup invite code.
-- If you haven't run this yet, the invite code feature won't work.

CREATE TABLE IF NOT EXISTS public.chapter_settings (
  id            int PRIMARY KEY DEFAULT 1,
  gpa_threshold numeric(3,2) NOT NULL DEFAULT 2.5,
  signup_code   text
);

-- Ensure exactly one row exists
INSERT INTO public.chapter_settings (id, gpa_threshold)
VALUES (1, 2.5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chapter_settings
  ADD COLUMN IF NOT EXISTS signup_code text;


-- ── submissions: ensure all app columns exist ─────────────────
-- These were added after the original schema. Safe to re-run.

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS round_id       uuid REFERENCES public.semester_rounds(id) ON DELETE SET NULL;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS decline_reason text;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS course_grades  jsonb;

-- Drop the old status constraint and add the full set of values
ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('pending', 'reviewed', 'no_grade', 'declined'));


-- ── semester_rounds table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.semester_rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id   uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  round_number  int NOT NULL DEFAULT 1,
  name          text NOT NULL DEFAULT 'Round 1',
  deadline      timestamptz NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(semester_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_semester_rounds_semester
  ON public.semester_rounds(semester_id);

-- ── member_courses table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  course_id   text NOT NULL,
  course_name text NOT NULL,
  credits     int NOT NULL DEFAULT 3,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dropped')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_courses_member_semester
  ON public.member_courses(member_id, semester_id);

-- ── profiles: optional columns ───────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS major   text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS strikes int NOT NULL DEFAULT 0;

-- ── semesters: optional columns ──────────────────────────────
ALTER TABLE public.semesters
  ADD COLUMN IF NOT EXISTS required_years text[];

-- ── drop_alerts table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drop_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  semester_id  uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  course_id    text NOT NULL,
  course_name  text NOT NULL,
  credits      int NOT NULL,
  member_name  text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- After running this file, also verify in Storage settings:
--   Bucket named "grade-photos" exists and is set to PRIVATE
-- ============================================================
