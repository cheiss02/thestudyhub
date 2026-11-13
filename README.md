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
| `supabase/functions/cleanup` | Deletes homework photos 30 days after each session |
| `supabase/schedule.sql` | Runs the cleanup every day |

## Who logs in

- **Parents:** email sign-in link, no password. Kids never have accounts.
- **Tutors:** same, with their school email. New tutors start as *pending* until an admin approves them.
- **Admins:** anyone whose email is in the `admins` table.

## Everyday changes

- **Session times, languages, subjects:** edit `js/config.js`.
- **Colors:** edit the `:root` block at the top of `css/styles.css`.
- **Rules text:** edit `rules.html`.
- **Add an admin:** Supabase → SQL Editor → `insert into admins (email) values ('name@school.org');`
- **Remove an admin:** `delete from admins where email = 'name@school.org';`

## One-time setup

### 1. Supabase (database, logins, photo storage)
1. Create a free project at supabase.com (region: West US).
2. SQL Editor → paste all of `supabase/setup.sql` → edit the admin emails at the bottom → **Run**.
3. Project Settings → API: copy the **Project URL** and **anon public key** into `js/config.js`.
4. Authentication → URL Configuration: Site URL `https://thestudyhub.us`, Redirect URLs `https://thestudyhub.us/**`.

### 2. Emails (Resend, free)
1. Sign up at resend.com, add domain `thestudyhub.us`, and add the DNS records it shows in GoDaddy.
2. Create an API key.
3. Supabase → Authentication → Emails → SMTP settings: host `smtp.resend.com`, port `465`,
   user `resend`, password = the API key, sender `no-reply@thestudyhub.us`, name `The Study Hub`.
4. Supabase → Edge Functions → deploy `notify` and `cleanup` (paste each `index.ts`),
   turning **off** "Verify JWT" for both.
5. Edge Functions → Secrets: `RESEND_API_KEY`, `WEBHOOK_SECRET`, `CRON_SECRET`,
   `MAIL_FROM` = `The Study Hub <no-reply@thestudyhub.us>`, `SITE_URL` = `https://thestudyhub.us`,
   `CLUB_EMAIL` = `hello@thestudyhub.us`.
6. Database → Webhooks → new webhook on table `requests`, events Insert + Update,
   type Supabase Edge Function `notify`, add header `x-webhook-secret` = your WEBHOOK_SECRET.
7. Database → Extensions: turn on `pg_cron` and `pg_net`, then run `supabase/schedule.sql`
   (fill in the project URL and CRON_SECRET).

### 3. Club inbox (Zoho Mail, free)
Sign up for Zoho Mail Forever Free with `thestudyhub.us`, create `hello@thestudyhub.us`,
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
