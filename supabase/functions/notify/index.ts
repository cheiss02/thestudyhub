// =====================================================================
// The Study Hub — email notifications
// Runs from Supabase Database Webhooks (see README) on these tables:
//   requests  → new request, approved, declined, cancelled
//   families  → new family to review (to the club), approved/declined (to the parent)
//   tutors    → new tutor application (to the club), approved/declined (to the tutor)
//
// Secrets to set in Supabase → Edge Functions → Secrets (never in GitHub):
//   STUDYHUB_SECRET_KEY  your sb_secret_... key (Project Settings → API Keys)
//   RESEND_API_KEY   from resend.com
//   WEBHOOK_SECRET   any long random text (same value in the webhook header)
//   MAIL_FROM        The Study Hub <no-reply@thestudyhub.us>
//   SITE_URL         https://thestudyhub.us
//   CLUB_EMAIL       help@thestudyhub.us
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SITE = env("SITE_URL", "https://thestudyhub.us");
const CLUB = env("CLUB_EMAIL", "help@thestudyhub.us");
const sb = createClient(env("SUPABASE_URL"), env("STUDYHUB_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"));

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function when(date: string, slot: string) {
  const d = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const [h, m] = slot.split(":").map(Number);
  return `${d} at ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
function layout(title: string, body: string, button?: [string, string]) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d2940">
    <div style="background:#fdf4e1;padding:18px 22px;border-radius:16px 16px 0 0;font-weight:800;font-size:20px">The Study Hub</div>
    <div style="background:#ffffff;border:2px solid #cddcee;border-top:0;padding:22px;border-radius:0 0 16px 16px">
      <h2 style="margin:0 0 12px">${title}</h2>${body}
      ${button ? `<p style="margin:22px 0"><a href="${button[1]}" style="background:#f2836b;color:#1d2940;border:2px solid #1d2940;border-radius:999px;padding:11px 20px;font-weight:700;text-decoration:none">${button[0]}</a></p>` : ""}
      <p style="color:#55627a;font-size:13px;margin-top:24px">The Study Hub is a free student club. Questions? Reply to ${CLUB}.</p></div></div>`;
}
async function send(to: string | undefined, subject: string, html: string) {
  if (!to) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM", "The Study Hub <no-reply@thestudyhub.us>"), to, reply_to: CLUB, subject, html }),
  });
  if (!r.ok) console.error("Resend error", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) return new Response("Unauthorized", { status: 401 });
  const { type, table, record: r, old_record: old } = await req.json();
  if (!r) return new Response("ok");
  const changed = type === "UPDATE" && old?.status !== r.status;

  if (table === "families") {
    if (type === "INSERT") {
      await send(CLUB, `New family to approve: ${r.parent_name}`,
        layout("A new family signed up", `<p><b>${esc(r.parent_name)}</b>${r.city ? ` from ${esc(r.city)}` : ""}${r.home_lang ? `, speaks ${esc(r.home_lang)} at home` : ""}.</p>${r.heard ? `<p>Heard about us: ${esc(r.heard)}</p>` : ""}<p>Approve or decline them on the Club admin page.</p>`, ["Review families", `${SITE}/admin.html`]));
    } else if (changed && r.status !== "pending") {
      const { data: u } = await sb.auth.admin.getUserById(r.id);
      if (r.status === "approved") await send(u?.user?.email, "You're approved! Book a free tutor",
        layout("Your family account is approved", `<p>Hi ${esc(r.parent_name)}, you can now book free homework help with our bilingual tutors.</p>`, ["Find a tutor", SITE]));
      else await send(u?.user?.email, "About your Study Hub account",
        layout("We couldn't approve your account", `<p>Hi ${esc(r.parent_name)}, we weren't able to approve your family account right now. If you have questions, just reply to this email.</p>`));
    }
    return new Response("ok");
  }

  if (table === "tutors") {
    if (type === "INSERT") {
      await send(CLUB, `New tutor application: ${r.name}`,
        layout("A new tutor applied", `<p><b>${esc(r.name)}</b> (${esc(r.grade)} grade) speaks ${esc((r.langs || []).join(", "))} and can help with ${esc((r.subjects || []).join(", "))}.</p><p>Check that they signed the code of conduct, then approve them on the Club admin page.</p>`, ["Review tutors", `${SITE}/admin.html`]));
    } else if (changed && (r.status === "active" && old?.status === "pending" || r.status === "declined")) {
      const { data: p } = await sb.from("tutor_private").select("school_email").eq("tutor_id", r.id).single();
      if (r.status === "active") await send(p?.school_email, "You're approved as a Study Hub tutor!",
        layout("Welcome to the team!", `<p>Hi ${esc(r.name)}, you're approved. Add your Google Meet link and pick your weekly times, and families can start booking you.</p>`, ["Open my dashboard", `${SITE}/tutor.html`]));
      else await send(p?.school_email, "About your tutor application",
        layout("Application update", `<p>Hi ${esc(r.name)}, we weren't able to approve your application right now. Questions? Reply to this email.</p>`));
    }
    return new Response("ok");
  }

  // ---- requests ----

  const [{ data: tutor }, { data: priv }, { data: parent }] = await Promise.all([
    sb.from("tutors").select("name").eq("id", r.tutor_id).single(),
    sb.from("tutor_private").select("school_email,meet_link").eq("tutor_id", r.tutor_id).single(),
    sb.auth.admin.getUserById(r.parent_id),
  ]);
  const tName = esc(tutor?.name ?? "Your tutor");
  const parentEmail = parent?.user?.email;
  const at = when(r.session_date, r.slot);
  const child = esc(r.child_first);

  if (type === "INSERT") {
    await send(priv?.school_email, `New tutoring request: ${r.child_first}, ${at}`,
      layout("You have a new request", `<p>${esc(r.parent_name)} asked for help for <b>${child}</b> (${esc(r.grade)} grade, ${esc(r.subject)}, ${esc(r.lang)}) on <b>${at}</b>.</p>
      <p>Look at the homework photos, then approve or decline within 48 hours.</p>`, ["Review the request", `${SITE}/tutor.html`]));
  } else if (changed) {
    if (r.status === "approved") {
      await send(parentEmail, `Approved: ${r.child_first}'s session ${at}`,
        layout("Your session is approved!", `<p><b>${tName}</b> will help <b>${child}</b> on <b>${at}</b> (about 30 minutes).</p>
        ${r.tutor_note ? `<p style="background:#f2f8ff;padding:10px 12px;border-radius:10px"><b>Note from ${tName}:</b> ${esc(r.tutor_note)}</p>` : ""}
        <p>At session time, open the Google Meet link below. Please have the homework ready and stay nearby during the call.</p>`,
        ["Join Google Meet", esc(priv?.meet_link || `${SITE}/account.html`)]));
    } else if (r.status === "declined") {
      await send(parentEmail, `Request update for ${r.child_first}`,
        layout("This tutor can't take this session", `<p>${tName} isn't able to help on ${at}.</p>
        ${r.tutor_note ? `<p><b>Note:</b> ${esc(r.tutor_note)}</p>` : ""}<p>Please pick another time or tutor. It's still free!</p>`,
        ["Find another time", SITE]));
    } else if (r.status === "cancelled") {
      const msg = layout("Session cancelled", `<p>The session for <b>${child}</b> with ${tName} on <b>${at}</b> was cancelled.</p>`, ["Open The Study Hub", SITE]);
      await Promise.all([send(parentEmail, `Cancelled: ${r.child_first}'s session ${at}`, msg), send(priv?.school_email, `Cancelled: ${r.child_first}'s session ${at}`, msg)]);
    }
  }
  return new Response("ok");
});
