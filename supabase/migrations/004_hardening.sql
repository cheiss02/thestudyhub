-- =====================================================================
-- Update 004: security hardening from the full review.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

-- 1) Admin checks use the CONFIRMED email of the signed-in account,
--    so nobody can become admin by signing up with an unverified address.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

-- 2) Only approved families can upload homework photos.
drop policy if exists hw_upload on storage.objects;
create policy hw_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'homework'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.families f where f.id = auth.uid() and f.status = 'approved')
  );

-- 3) Request rules: no times already passed today, and at most 3 waiting requests per family.
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
  if new.session_date < now_la::date
     or new.session_date > now_la::date + 21 then
    raise exception 'Please pick a date in the next 3 weeks.';
  end if;
  if (new.session_date + new.slot::time) <= now_la then
    raise exception 'That time has already passed. Please pick another.';
  end if;
  if not exists (
    select 1 from public.tutors t
    join public.availability a on a.tutor_id = t.id
    where t.id = new.tutor_id and t.status = 'active'
      and a.dow = extract(isodow from new.session_date)
      and a.slot = new.slot
  ) then
    raise exception 'Sorry, that time is no longer open.';
  end if;
  return new;
end $$;

-- 4) Tutors can only be booked by families, not by themselves.
create or replace function public.requests_not_self() returns trigger
language plpgsql as $$
begin
  if new.tutor_id = new.parent_id then raise exception 'You can''t book yourself.'; end if;
  return new;
end $$;
drop trigger if exists requests_not_self on public.requests;
create trigger requests_not_self before insert on public.requests
  for each row execute function public.requests_not_self();

-- 5) Text limits on tutor notes (set through respond_request).
alter table public.requests drop constraint if exists requests_tutor_note_len;
alter table public.requests add constraint requests_tutor_note_len check (char_length(tutor_note) <= 400);
