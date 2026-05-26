# Chapter Grade Portal — Setup Guide

## Prerequisites
Install Node.js from https://nodejs.org (LTS version). This is the only thing you need to install.

---

## Step 1: Install dependencies
Open a terminal in this folder and run:
```
npm install
```

---

## Step 2: Create a Supabase project (free)
1. Go to https://supabase.com and sign up (free)
2. Click **New Project**, give it a name like "fraternity-grades"
3. Wait for it to provision (1-2 minutes)
4. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3: Run the database schema
1. In Supabase, go to **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql` and click **Run**
3. You should see "Success. No rows returned"

---

## Step 4: Create the photo storage bucket
1. In Supabase, go to **Storage**
2. Click **New Bucket**, name it exactly: `grade-photos`
3. Set it to **Private** (not public)
4. Click Create

---

## Step 5: Set up Gmail for email reminders
1. Use or create a Gmail account for the chapter (e.g. phikap.academics@gmail.com)
2. Go to https://myaccount.google.com → Security → 2-Step Verification (enable it)
3. Then go to Security → App Passwords
4. Create an app password for "Mail" — copy the 16-character code
5. That code is your `GMAIL_APP_PASSWORD`

---

## Step 6: Create your .env.local file
Copy `.env.local.example` to `.env.local` and fill in all values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GMAIL_USER=yourchapter@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Step 7: Run the app
```
npm run dev
```
Open http://localhost:3000

---

## Step 8: Set the first admin
1. Sign up at http://localhost:3000/auth/signup with the VP of Academics' email
2. Go to Supabase → **SQL Editor** and run:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'vp@email.com';
   ```
3. Log out and log back in — you'll be redirected to the admin panel

---

## Deploying to Vercel (free public URL)
1. Push this folder to a GitHub repository
2. Go to https://vercel.com, sign up with GitHub
3. Click **New Project** and import your repo
4. Under **Environment Variables**, add all 6 variables from your `.env.local`
5. Change `NEXT_PUBLIC_SITE_URL` to your Vercel URL (e.g. `https://frat-grades.vercel.app`)
6. Click Deploy

Your app will be live at a public URL you can share with all members.

---

## How it works

### For members
1. Go to the site URL → Sign Up with name, email, class year
2. Dashboard shows open semesters with deadlines
3. Click "Submit Grades" → upload a Blackboard screenshot
4. OCR reads the grade automatically (you can correct it)
5. Or select "No Grade This Semester" if not enrolled

### For the VP of Academics (admin)
1. Log in → redirected to Admin Panel
2. **Dashboard**: see submission rates, pending reviews, chapter GPA
3. **Semesters**: create semesters, set deadlines, send email reminders
4. **Submissions**: review all photos, correct OCR-detected grades, add notes
   - ⚠️ "Duplicate" badge = same photo submitted before (fraud detection)
5. **Members**: view all members, promote to admin
6. **Export**: download a formatted .xlsx with one sheet per member

---

## Troubleshooting
- **OCR not working**: Tesseract.js downloads a language model on first use (~10MB). Wait for the loading spinner.
- **Email not sending**: Double-check your Gmail App Password — it must be the 16-char code, not your account password.
- **Photos not uploading**: Make sure the `grade-photos` bucket exists in Supabase Storage and is set to Private.
- **"Unauthorized" errors**: Make sure `SUPABASE_SERVICE_ROLE_KEY` is set correctly (it's different from the anon key).
