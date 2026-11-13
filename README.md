# The Study Hub — thestudyhub.us

Free homework help for elementary students from bilingual high school volunteers.
Families pick a tutor by language, send a request with homework photos, and the
tutor approves or declines. Sessions happen on Google Meet.

Plain HTML, CSS and JavaScript. No build step: edit a file, commit, and the site updates.

## What's where

| File | What it is |
|---|---|
| `index.html` + `js/booking.js` | Find a tutor (home page) and the request form with photo upload |
| `account.html` + `js/account.js` | My requests: parents see status, the Meet link, cancel, delete data |
| `tutor.html` + `js/tutor.js` | Tutor application, then the dashboard: requests, weekly times, profile |
| `admin.html` + `js/admin.js` | Club admin: approve tutors, pause tutors, see sessions |
| `rules.html` | Terms, privacy policy, parent consent, tutor code of conduct, safety rules |
| `css/styles.css` | All styling. **Brand colors are at the top.** |
| `js/config.js` | **Settings: session times, languages, subjects, Supabase keys** |
| `js/app.js` | Shared code: header, sign-in, dates, pop-ups |
| `images/logo.svg` | Logo (replace with the real logo file any time) |
| `supabase/setup.sql` | Database tables and security rules |
| `supabase/functions/notify` | Sends emails when requests are made, approved, declined or cancelled |
| `supabase/functions/cleanup` | Every 15 min: reminder emails 1 day and 1 hour before sessions, and deletes homework photos 30 days after each session |
| `supabase/schedule.sql` | Runs the cleanup/reminder job every 15 minutes |

## Who logs in

Everyone signs in with their email: a link or a 6-digit code, no password. Kids never have accounts.
- **Parents:** create an account, fill in a short family profile, and wait for an admin to approve them before booking.
- **Tutors:** apply with their school email and wait for an admin to approve them.
- **Admins:** only help@thestudyhub.us to start. Admins add or remove other admins on the Club admin page.

## Database updates to run (in order)
`supabase/setup.sql` (first time only), then `supabase/migrations/002_admins.sql`, `003_family_approval.sql`, `004_hardening.sql`, `005_session_records.sql`, `006_calendar_dates.sql` and `007_reminders.sql`.

If you ever update the Supabase library version in the HTML files, update its `integrity` hash too (the browser refuses a file that doesn't match).

## Session records and hours
- After a session starts, the tutor taps **Mark as done** (did the child join, how long, what they worked on).
- Tutors see their **History**: every child they helped, with dates, notes and total volunteer time.
- Parents see each child's sessions, the tutor's notes and total time.
- Admins see total help hours, sessions completed and volunteer time per tutor. Each counter has **Reset** (start from zero, records kept). **Delete all sessions and photos** erases test data.

## After changing CSS or JS
Run `./bump-version.sh` (or change the `?v=` number on the file links) so visitors get the new version immediately instead of an old saved copy.

## Everyday changes

- **Session times, languages, subjects:** edit `js/config.js`.
- **Colors:** edit the `:root` block at the top of `css/styles.css`.
- **Rules text:** edit `rules.html`.
- **Add or remove admins:** Club admin page → Club admins.

## One-time setup

### 1. Supabase (database, logins, photo storage)
1. Create a free project at supabase.com (region: West US).
2. SQL Editor → paste all of `supabase/setup.sql` → edit the admin emails at the bottom → **Run**.
3. Project Settings → API Keys: the **Project URL** and **publishable key** go in `js/config.js` (done).
4. Authentication → URL Configuration: Site URL `https://thestudyhub.us`, Redirect URLs `https://thestudyhub.us/**`.

### 1b. Sign-in emails with a code
Supabase → Authentication → Emails → Templates. Paste `supabase/email-templates/magic-link.html` into
**Magic Link** and `confirm-signup.html` into **Confirm signup** (subject: "Your Study Hub sign-in code").
The code lets people read the email on their phone and sign in on their computer.

### 2. Emails (Resend, free)
1. Sign up at resend.com, add domain `thestudyhub.us`, and add the DNS records it shows in GoDaddy.
2. Create an API key.
3. Supabase → Authentication → Emails → SMTP settings: host `smtp.resend.com`, port `465`,
   user `resend`, password = the API key, sender `no-reply@thestudyhub.us`, name `The Study Hub`.
4. Supabase → Edge Functions → deploy `notify` and `cleanup` (paste each `index.ts`),
   turning **off** "Verify JWT" for both.
5. Edge Functions → Secrets: `STUDYHUB_SECRET_KEY` (your `sb_secret_...` key), `RESEND_API_KEY`, `WEBHOOK_SECRET`, `CRON_SECRET`,
   `MAIL_FROM` = `The Study Hub <no-reply@thestudyhub.us>`, `SITE_URL` = `https://thestudyhub.us`,
   `CLUB_EMAIL` = `help@thestudyhub.us`.
6. Database → Webhooks → create **three** webhooks, on tables `requests`, `families` and `tutors`,
   each with events Insert + Update, type Supabase Edge Function `notify`,
   and header `x-webhook-secret` = your WEBHOOK_SECRET.
7. Database → Extensions: turn on `pg_cron` and `pg_net`, then run `supabase/schedule.sql`
   (fill in the project URL and CRON_SECRET).

### 3. Club inbox (Zoho Mail, free)
Sign up for Zoho Mail Forever Free with `thestudyhub.us`, create `help@thestudyhub.us`,
and add Zoho's MX, SPF and DKIM records in GoDaddy. Resend uses the `send.` subdomain, so they don't clash.

### 4. Website (GitHub Pages + GoDaddy)
GitHub repo → Settings → Pages → deploy from branch `main`, folder `/`. The `CNAME` file sets the domain.
In GoDaddy DNS:
- `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `CNAME` for `www` → `<github-username>.github.io`

Then tick **Enforce HTTPS** in GitHub Pages settings once it's available.

### 5. Optional: Google sign-in for tutors
Set up a Google OAuth client, add it in Supabase → Authentication → Providers → Google,
then set `GOOGLE_LOGIN: true` in `js/config.js`.

## Keeping keys safe
- **Public (fine in GitHub):** the Project URL and the publishable key (`sb_publishable_...`) in `js/config.js`.
  They only let the site talk to the database; the rules in `supabase/setup.sql` decide what anyone can see.
- **Secret (never in GitHub, never in chat):** the secret key (`sb_secret_...`), the Resend API key,
  `WEBHOOK_SECRET`, `CRON_SECRET` and the database password. They live only in Supabase → Edge Functions → Secrets.
- If a secret ever leaks: Supabase → Project Settings → API Keys → create a new secret key, update the secret, delete the old key.

## Privacy built in
- Only a parent can book. The form collects the child's first name only.
- Homework photos are private: only the parent, the chosen tutor and admins can open them,
  through links that expire after an hour.
- Tutors never see parents' email addresses. Emails are sent automatically.
- Photos are deleted 30 days after the session, and requests after one year.
- Parents can delete everything from **My requests**.

## Learn the tools (videos)
- Supabase: https://www.youtube.com/@Supabase
- GitHub Pages: search YouTube for "GitHub Pages custom domain GoDaddy"
