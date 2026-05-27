# Fraternity Grade Portal

A web app for collecting and tracking member GPA submissions each semester. Built for a fraternity chapter to automate grade collection, reduce manual entry, and give leadership a real-time view of academic standing.

## Features

- **Member submission flow** — members upload a Blackboard screenshot; OCR reads the GPA automatically
- **Semester rounds** — each semester can have multiple rounds (mid-semester check-ins); members enter courses once and only re-submit photos each round
- **Course drop alerts** — members can mark dropped courses; VP of Academics is notified instantly
- **Admin review** — one-click approve or manual override per submission; photo viewer inline
- **Duplicate detection** — perceptual hashing flags recycled photos and cross-member photo sharing
- **Name cross-reference** — OCR text is checked against the submitting member's name
- **Email reminders** — send targeted reminders by class year; confirmation emails on submission
- **Excel export** — per-semester detailed report or full GPA history across all semesters
- **Role management** — promote members to admin with confirmation guard

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (Pages Router), Tailwind CSS |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (HttpOnly cookies) |
| Storage | Supabase Storage (grade photos) |
| OCR | Tesseract.js (client-side) |
| Email | Gmail SMTP via Nodemailer |
| Hosting | Vercel |

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/Grant-Popp/fraternity-grades.git
   cd fraternity-grades
   npm install
   ```

2. Copy the environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase URL, anon key, service role key, Gmail credentials, and site URL.

3. Run the database migrations in Supabase SQL Editor (see `supabase/schema.sql` for table definitions).

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `GMAIL_USER` | Gmail address for sending emails |
| `GMAIL_APP_PASSWORD` | Gmail App Password |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (e.g. `https://yourapp.vercel.app`) |

## Deployment

Push to `main` → Vercel auto-deploys. Use `dev` branch for development work and merge to `main` when ready to release.
