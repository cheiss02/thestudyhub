// =====================================================================
// The Study Hub — scheduled jobs (runs every 15 minutes, see schedule.sql)
//   1) Reminder emails 1 day and 1 hour before each approved session,
//      to the family and the tutor.
//   2) Privacy cleanup: deletes homework photos 30 days after each session
//      and removes requests older than one year.
//
// Secrets (Edge Functions → Secrets, never in GitHub):
//   STUDYHUB_SECRET_KEY (sb_secret_...), CRON_SECRET, RESEND_API_KEY,
//   MAIL_FROM, SITE_URL, CLUB_EMAIL
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SITE = env("SITE_URL", "https://thestudyhub.us");
const CLUB = env("CLUB_EMAIL", "help@thestudyhub.us");
const sb = createClient(env("SUPABASE_URL"), env("STUDYHUB_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"));
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function when(date: string, slot: string) {
  const d = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const [h, m] = slot.split(":").map(Number);
  return `${d} at ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
function layout(title: string, body: string, buttons: [string, string][] = []) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d2940">
    <div style="background:#fdf4e1;padding:18px 22px;border-radius:16px 16px 0 0;font-weight:800;font-size:20px">The Study Hub</div>
    <div style="background:#ffffff;border:2px solid #cddcee;border-top:0;padding:22px;border-radius:0 0 16px 16px">
      <h2 style="margin:0 0 12px">${title}</h2>${body}
      ${buttons.length ? `<p style="margin:22px 0">${buttons.map(([t, u], i) => `<a href="${u}" style="display:inline-block;margin:0 8px 8px 0;background:${i ? "#ffffff" : "#f2836b"};color:#1d2940;border:2px solid #1d2940;border-radius:999px;padding:11px 20px;font-weight:700;text-decoration:none">${t}</a>`).join("")}</p>` : ""}
      <p style="color:#55627a;font-size:13px;margin-top:24px">The Study Hub is a free student club. Questions? Reply to ${CLUB}.</p></div></div>`;
}
async function send(to: string | undefined, subject: string, html: string) {
  if (!to) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM", "The Study Hub <no-reply@thestudyhub.us>"), to, reply_to: CLUB, subject, html }),
  });
  if (!r.ok) console.error("Resend error", r.status, await r.text());
  return r.ok;
}

// 1) Reminders: 1 day and 1 hour before approved sessions.
async function sendReminders() {
  const { data: due, error } = await sb.rpc("due_reminders");
  if (error) { console.error(error.message); return 0; }
  let sent = 0;
  for (const { id, kind } of due ?? []) {
    const { data: r } = await sb.from("requests").select("*").eq("id", id).single();
    if (!r) continue;
    const [{ data: tutor }, { data: priv }, { data: parent }] = await Promise.all([
      sb.from("tutors").select("name").eq("id", r.tutor_id).single(),
      sb.from("tutor_private").select("school_email,meet_link").eq("tutor_id", r.tutor_id).single(),
      sb.auth.admin.getUserById(r.parent_id),
    ]);
    const at = when(r.session_date, r.slot);
    const soon = kind === "1h";
    const meet = esc(priv?.meet_link || `${SITE}/account.html`);
    const child = esc(r.child_first), tName = esc(tutor?.name ?? "your tutor");

    // To the family (kids don't have accounts, so the parent gets it)
    await send(parent?.user?.email,
      soon ? `Starts in 1 hour: ${r.child_first}'s tutoring session` : `Reminder: ${r.child_first}'s tutoring session ${at}`,
      layout(soon ? "Your session starts in 1 hour" : "Your session is tomorrow",
        `<p><b>${child}</b> meets <b>${tName}</b> on <b>${at}</b> (about 30 minutes).</p>
         <ul style="padding-left:18px"><li>Have the homework ready.</li><li>Use a device with a camera and microphone.</li><li>Please stay nearby during the call.</li></ul>
         <p style="color:#55627a;font-size:14px">Can't make it? Please cancel on My requests so the tutor knows.</p>`,
        [["Join Google Meet", meet], ["My requests", `${SITE}/account.html`]]));

    // To the tutor
    await send(priv?.school_email,
      soon ? `Starts in 1 hour: session with ${r.child_first}` : `Reminder: session with ${r.child_first} ${at}`,
      layout(soon ? "Your session starts in 1 hour" : "You're tutoring tomorrow",
        `<p>You're helping <b>${child}</b> (${esc(r.grade)} grade, ${esc(r.subject)}, ${esc(r.lang)}) on <b>${at}</b>.</p>
         ${r.note ? `<p style="background:#f2f8ff;padding:10px 12px;border-radius:10px"><b>From the family:</b> ${esc(r.note)}</p>` : ""}
         <p>Look over the homework photos before you start. Afterwards, tap <b>Mark as done</b> so it counts toward your volunteer hours.</p>`,
        [["Open my Meet", meet], ["See the homework", `${SITE}/tutor.html`]]));

    // Mark as sent so nobody gets it twice
    const now = new Date().toISOString();
    await sb.from("requests").update(soon ? { reminded_1h_at: now, reminded_24h_at: r.reminded_24h_at ?? now } : { reminded_24h_at: now }).eq("id", id);
    sent++;
  }
  return sent;
}

// 2) Privacy cleanup
async function cleanup() {
  const { data: old } = await sb.from("requests").select("id,photo_paths")
    .lt("session_date", daysAgo(30)).neq("photo_paths", "{}").limit(500);
  let photos = 0;
  for (const r of old ?? []) {
    const { error } = await sb.storage.from("homework").remove(r.photo_paths);
    if (!error) {
      await sb.from("requests").update({ photo_paths: [] }).eq("id", r.id);
      photos += r.photo_paths.length;
    }
  }
  const { count } = await sb.from("requests").delete({ count: "exact" }).lt("session_date", daysAgo(365));
  return { photos, requests: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("Unauthorized", { status: 401 });
  const reminders = await sendReminders();
  const { photos, requests } = await cleanup();
  return Response.json({ remindersSent: reminders, photosDeleted: photos, requestsDeleted: requests });
});
