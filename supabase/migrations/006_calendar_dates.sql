-- =====================================================================
-- Update 006: tutors can open extra times or take time off on specific
-- dates, and families can book up to 8 weeks ahead.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

-- open = true  → an extra time on that date (not part of the weekly schedule)
-- open = false → that weekly time is OFF on that date (holiday, test day…)
create table if not exists public.availability_dates (
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  day      date not null,
  slot     text not null check (slot ~ '^\d{2}:\d{2}$'),
  open     boolean not null,
  primary key (tutor_id, day, slot)
);

alter table public.availability_dates enable row level security;
drop policy if exists ad_select on public.availability_dates;
drop policy if exists ad_insert on public.availability_dates;
drop policy if exists ad_update on public.availability_dates;
drop policy if exists ad_delete on public.availability_dates;
create policy ad_select on public.availability_dates for select
  using (tutor_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.tutors t where t.id = tutor_id and t.status = 'active'));
create policy ad_insert on public.availability_dates for insert to authenticated
  with check (tutor_id = auth.uid() and day >= (now() at time zone 'America/Los_Angeles')::date
              and day <= (now() at time zone 'America/Los_Angeles')::date + 63);
create policy ad_update on public.availability_dates for update to authenticated
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
create policy ad_delete on public.availability_dates for delete to authenticated
  using (tutor_id = auth.uid() or public.is_admin());

-- Is this tutor open on this date and time? (weekly schedule, minus days off, plus extra times)
create or replace function public.is_open(t uuid, d date, s text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select x.open from public.availability_dates x where x.tutor_id = t and x.day = d and x.slot = s),
    exists (select 1 from public.availability a where a.tutor_id = t and a.dow = extract(isodow from d) and a.slot = s)
  );
$$;

-- Booking rules: now up to 8 weeks ahead, and respects date-specific changes.
create or replace function public.requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare now_la timestamp := (now() at time zone 'America/Los_Angeles');
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not exists (select 1 from public.families f where f.id = auth.uid() and f.status = 'approved') then
    raise exception 'Your family account is waiting for a club admin to approve it.';
  end if;
  if (select count(*) from public.requests r
      where r.parent_id = auth.uid() and r.status = 'pending') >= 3 then
    raise exception 'You already have 3 requests waiting for a tutor. Please wait for an answer before sending more.';
  end if;
  new.parent_id    := auth.uid();
  new.status       := 'pending';
  new.tutor_note   := '';
  new.responded_at := null;
  new.consent_at   := now();

  if cardinality(new.photo_paths) < 1 then
    raise exception 'Please add at least one homework photo.';
  end if;
  if exists (select 1 from unnest(new.photo_paths) p
             where p not like auth.uid()::text || '/%') then
    raise exception 'Invalid photo.';
  end if;
  if new.session_date < now_la::date or new.session_date > now_la::date + 63 then
    raise exception 'Please pick a date in the next 8 weeks.';
  end if;
  if (new.session_date + new.slot::time) <= now_la then
    raise exception 'That time has already passed. Please pick another.';
  end if;
  if not exists (select 1 from public.tutors t where t.id = new.tutor_id and t.status = 'active')
     or not public.is_open(new.tutor_id, new.session_date, new.slot) then
    raise exception 'Sorry, that time is no longer open.';
  end if;
  return new;
end $$;
