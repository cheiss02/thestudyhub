// =====================================================================
// The Study Hub — email notifications
// Runs from Supabase Database Webhooks (see README) on these tables:
//   requests  → new request, approved, declined, cancelled (+ last-minute alert),
//               running late, no-shows (with repeat no-show alerts to the club)
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
// Minutes from now until a session starts (Los Angeles time).
function minsUntil(date: string, slot: string) {
  const la = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const [y, mo, d] = date.split("-").map(Number), [h, m] = slot.split(":").map(Number);
  return (new Date(y, mo - 1, d, h, m).getTime() - la.getTime()) / 60000;
}
function endTime(slot: string) {
  const [h, m] = slot.split(":").map(Number), t = h * 60 + m + 30;
  const H = Math.floor(t / 60), M = t % 60;
  return `${((H + 11) % 12) + 1}:${String(M).padStart(2, "0")} ${H < 12 ? "am" : "pm"}`;
}
async function noShows(kind: "family" | "tutor", person: string) {
  const { data } = await sb.rpc("no_show_counts");
  return (data || []).find((x: { kind: string; person: string; n: number }) => x.kind === kind && x.person === person)?.n ?? 0;
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
      if (r.status === "approved" && old?.status === "pending") await send(u?.user?.email, "You're approved! Book a free tutor",
        layout("Your family account is approved", `<p>Hi ${esc(r.parent_name)}, you can now book free homework help with our bilingual tutors.</p>`, ["Find a tutor", SITE]));
      else if (old?.status === "pending") await send(u?.user?.email, "About your Study Hub account",
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
      const by = r.cancelled_by === "tutor" ? `${tName} (the tutor)` : r.cancelled_by === "parent" ? "the family" : r.cancelled_by === "admin" ? "a club admin" : "";
      const subject = `Cancelled: ${r.child_first}'s session ${at}`;
      const base = `<p>The session for <b>${child}</b> with ${tName} on <b>${at}</b> was cancelled${by ? ` by ${by}` : ""}.</p>`;
      await Promise.all([
        send(parentEmail, subject, layout("Session cancelled", base + (r.cancelled_by === "tutor" ? "<p>We're sorry! You can book another time or another tutor. It's still free.</p>" : ""), [r.cancelled_by === "tutor" ? "Book another time" : "Open The Study Hub", SITE])),
        send(priv?.school_email, subject, layout("Session cancelled", base + "<p>That time is open again on your calendar.</p>", ["Open my dashboard", `${SITE}/tutor.html`])),
      ]);
      // Cancelled less than 2 hours before the start: let the club know.
      if (old?.status === "approved" && minsUntil(r.session_date, r.slot) < 120 && r.cancelled_by !== "admin") {
        await send(CLUB, `Last-minute cancel: ${r.child_first}'s session ${at}`,
          layout("Last-minute cancellation", `<p>${by || "Someone"} cancelled <b>${child}</b>'s session with ${tName} on <b>${at}</b>, less than 2 hours before it started.</p><p>No action needed unless this keeps happening.</p>`, ["Club admin", `${SITE}/admin.html`]));
      }
    }
  }

  if (type === "UPDATE" && r.late_at && r.late_at !== old?.late_at) {
    // Running late: tell the other side right away.
    const tutorLate = r.late_by === "tutor";
    const who = tutorLate ? tName : `${child}'s family`;
    const html = layout(`${tutorLate ? "Your tutor is" : "The family is"} running late`,
      `<p>${who} will be about <b>${r.late_minutes} minutes</b> late for the session on <b>${at}</b>.</p>
       <p>Please stay in the Google Meet. The session still ends at <b>${endTime(r.slot)}</b>.</p>`,
      tutorLate ? ["Join Google Meet", esc(priv?.meet_link || `${SITE}/account.html`)] : ["Open my Meet", esc(priv?.meet_link || `${SITE}/tutor.html`)]);
    await send(tutorLate ? parentEmail : priv?.school_email, `Running ${r.late_minutes} min late: ${r.child_first}'s session`, html);
  }

  if (type === "UPDATE" && r.completed_at && !old?.completed_at && r.attended === false) {
    if (r.tutor_no_show_at) {
      // The family reported that the tutor never joined.
      const n = await noShows("tutor", r.tutor_id);
      await Promise.all([
        send(parentEmail, `We're sorry: ${r.child_first}'s session ${at}`,
          layout("We're sorry your tutor didn't join", `<p>Thanks for letting us know. A club admin will follow up with ${tName}.</p><p>You can book another time or another tutor right away. It's still free.</p>`, ["Book another time", SITE])),
        send(priv?.school_email, `Missed session: ${r.child_first}, ${at}`,
          layout("The family says you didn't join", `<p>${esc(r.parent_name)} reported that you didn't join <b>${child}</b>'s session on <b>${at}</b>.</p><p>If that's not right, reply to this email. Next time, if you can't make it, tap <b>Cancel session</b> or <b>Running late</b> on your dashboard so the family knows.</p>`, ["Open my dashboard", `${SITE}/tutor.html`])),
        send(CLUB, `Tutor no-show (${n} in 30 days): ${tutor?.name ?? "tutor"}`,
          layout("A tutor didn't join a session", `<p><b>${tName}</b> didn't join <b>${child}</b>'s session on <b>${at}</b> (reported by the family).</p><p>No-shows in the last 30 days: <b>${n}</b>.${n >= 3 ? " <b>Please pause this tutor</b> on the Club admin page and talk with them." : n >= 2 ? " Please check in with them." : ""}</p>`, ["Club admin", `${SITE}/admin.html`])),
      ]);
    } else {
      // The tutor logged that the child didn't join.
      const n = await noShows("family", r.parent_id);
      await send(parentEmail, `We missed ${r.child_first} today`,
        layout(`We missed ${child} today`, `<p>${tName} waited in the Google Meet for <b>${child}</b>'s session on <b>${at}</b>, but no one joined.</p>
          <p>No problem, life happens! Next time, please tap <b>Can't make it</b> or <b>Running late</b> on My requests so your tutor knows.</p>
          ${n >= 2 ? "<p>We've missed you a few times this month. If these times don't work anymore, please pick times that do so tutors can help other kids too.</p>" : ""}`, ["Book another time", SITE]));
      if (n >= 2) await send(CLUB, `Family no-show (${n} in 30 days): ${r.parent_name}`,
        layout("A family missed another session", `<p><b>${esc(r.parent_name)}</b> missed <b>${child}</b>'s session with ${tName} on <b>${at}</b>.</p><p>No-shows in the last 30 days: <b>${n}</b>.${n >= 3 ? " Please reach out, and pause their bookings if needed." : " Please check in with them."}</p>`, ["Club admin", `${SITE}/admin.html`]));
    }
  }
  return new Response("ok");
});
