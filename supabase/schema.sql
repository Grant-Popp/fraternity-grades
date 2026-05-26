-- ============================================================
-- Fraternity Grade Portal — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  email       text NOT NULL UNIQUE,
  class_year  text NOT NULL CHECK (class_year IN ('Freshman','Sophomore','Junior','Senior')),
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Semesters table
CREATE TABLE IF NOT EXISTS public.semesters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  deadline    timestamptz NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Submissions table
CREATE TABLE IF NOT EXISTS public.submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  semester_id     uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  photo_url       text,
  no_grade        boolean NOT NULL DEFAULT false,
  ocr_raw_text    text,
  ocr_gpa         numeric(3,2),
  admin_gpa       numeric(3,2),
  final_gpa       numeric(3,2),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','no_grade')),
  photo_phash     text,
  duplicate_flag  boolean NOT NULL DEFAULT false,
  admin_notes     text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  UNIQUE(member_id, semester_id)
);

-- Email logs table
CREATE TABLE IF NOT EXISTS public.email_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL CHECK (type IN ('reminder','deadline_warning','confirmation'))
);

-- ============================================================
-- Trigger: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, class_year)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'class_year', 'Freshman')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: members read/update own; admins read all
CREATE POLICY "Members can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Members can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Semesters: all authenticated users can read; only service role can write
CREATE POLICY "Authenticated users can read semesters"
  ON public.semesters FOR SELECT
  USING (auth.role() = 'authenticated');

-- Submissions: members can read/insert own; service role handles admin updates
CREATE POLICY "Members can read own submissions"
  ON public.submissions FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "Members can insert own submissions"
  ON public.submissions FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "Admins can read all submissions"
  ON public.submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Email logs: only service role (API routes) can access
-- No user-facing RLS policy needed; access is via service role key

-- ============================================================
-- Storage: grade-photos bucket
-- Run separately in Storage settings or via Supabase dashboard:
-- Create a bucket named "grade-photos" set to PRIVATE
-- ============================================================

-- ============================================================
-- To set the first admin, run after your first signup:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
-- ============================================================
