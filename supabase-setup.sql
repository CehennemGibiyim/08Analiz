-- 08 Analiz: Supabase kurulumu
-- Supabase Dashboard > SQL Editor bölümünde bir kez çalıştırın.
-- İlk admin hesabını Auth > Users bölümünden oluşturduktan sonra en alttaki UPDATE'i düzenleyin.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'guest' check (role in ('admin', 'guest')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- İlk admini Supabase Dashboard > Authentication > Users bölümünde oluşturun.
-- E-posta onayını kapattıktan sonra aşağıdaki satırda gerçek e-postayı kullanın:
-- update public.profiles set role = 'admin' where username = 'admin';

-- Uygulama içinden yeni kullanıcı eklemek için:
-- Authentication > Providers > Email bölümünde Confirm email seçeneğini kapatın.
