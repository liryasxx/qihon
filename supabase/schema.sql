-- Run once in Supabase SQL Editor. No service-role key is needed in the app.
-- Credentials and password hashes are managed by Supabase Auth.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  manga_id uuid not null,
  manga jsonb not null check (jsonb_typeof(manga) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);
create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  manga_id uuid not null,
  manga jsonb not null check (jsonb_typeof(manga) = 'object'),
  chapter_id uuid not null,
  chapter_number text not null,
  page integer not null default 0 check (page >= 0),
  total_pages integer not null check (total_pages > 0 and page < total_pages),
  chapter_offset integer not null default 0 check (chapter_offset >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);
alter table public.profiles enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reading_progress enable row level security;
revoke all on public.profiles, public.bookmarks, public.reading_progress from anon;
revoke all on public.profiles, public.bookmarks, public.reading_progress from authenticated;
grant select, insert, update, delete on public.profiles, public.bookmarks, public.reading_progress to authenticated;

drop policy if exists "Readers manage their own profile" on public.profiles;
create policy "Readers manage their own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Readers manage their own bookmarks" on public.bookmarks;
create policy "Readers manage their own bookmarks" on public.bookmarks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Readers manage their own progress" on public.reading_progress;
create policy "Readers manage their own progress" on public.reading_progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.handle_reader_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict(id) do update set display_name = excluded.display_name;
  return new;
end;
$$;
revoke all on function public.handle_reader_profile() from public, anon, authenticated;
drop trigger if exists on_reader_profile_changed on auth.users;
create trigger on_reader_profile_changed after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.handle_reader_profile();
insert into public.profiles(id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 60) from auth.users
on conflict(id) do nothing;
commit;
