// =====================================================================
// The Study Hub — daily privacy cleanup
// Deletes homework photos 30 days after each session and removes
// requests older than one year. Runs once a day (see schedule.sql).
//
// Secret to set: CRON_SECRET (any long random text, same as in schedule.sql)
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("Unauthorized", { status: 401 });

  // 1) Photos from sessions more than 30 days ago
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

  // 2) Requests older than a year
  const { count } = await sb.from("requests").delete({ count: "exact" }).lt("session_date", daysAgo(365));

  return Response.json({ photosDeleted: photos, requestsDeleted: count ?? 0 });
});
