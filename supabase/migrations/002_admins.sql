-- =====================================================================
-- Update 002: admins are managed from the Club admin page.
-- Only help@thestudyhub.us starts as an admin. It can't be removed.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

-- Keep emails lowercase and protect the main club account.
create or replace function public.admins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'help@thestudyhub.us' then
      raise exception 'The main club account can''t be removed.';
    end if;
    return old;
  end if;
  new.email := lower(trim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email.';
  end if;
  return new;
end $$;

drop trigger if exists admins_guard on public.admins;
create trigger admins_guard before insert or update or delete on public.admins
  for each row execute function public.admins_guard();

alter table public.admins add column if not exists added_at timestamptz not null default now();

-- Only existing admins can add or remove admins.
drop policy if exists admins_insert on public.admins;
drop policy if exists admins_delete on public.admins;
create policy admins_insert on public.admins for insert to authenticated with check (public.is_admin());
create policy admins_delete on public.admins for delete to authenticated using (public.is_admin());

-- Start with only the main club account.
delete from public.admins where lower(email) <> 'help@thestudyhub.us';
insert into public.admins (email) values ('help@thestudyhub.us') on conflict do nothing;
