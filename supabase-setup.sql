-- 08 Analiz: Supabase kurulumu ve kullanıcı yönetimi
-- Supabase Dashboard > SQL Editor bölümünde bir kez çalıştırın.
-- Bu dosya mevcut profilleri koruyacak şekilde güvenli migration komutları içerir.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  auth_email text,
  role text not null default 'guest' check (role in ('admin', 'guest')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists auth_email text;

update public.profiles p
set auth_email = u.email
from auth.users u
where u.id = p.id and (p.auth_email is null or p.auth_email = '');

create index if not exists profiles_auth_email_idx on public.profiles (auth_email);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, auth_email)
  values (
    new.id,
    lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))),
    new.email
  )
  on conflict (id) do update set auth_email = excluded.auth_email;
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

-- Kullanıcı adıyla girişte aktif hesabın gerçek Auth e-postasını döndürür.
-- Yalnızca uygulamanın dahili giriş adresini döndürür; şifre veya token vermez.
create or replace function public.resolve_login_email(input_username text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select p.auth_email
  from public.profiles p
  where p.is_active = true
    and lower(p.username) = lower(trim(input_username))
  limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

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

-- Admin panelindeki "Tamamen sil" işlemi için güvenli silme RPC'si.
-- Auth kullanıcıları istemci tarafından doğrudan silinemediği için işlem
-- security definer fonksiyonu üzerinden ve yalnızca aktif admin tarafından yapılır.
create or replace function public.delete_managed_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot_remove_self';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user_not_found';
  end if;
  if exists (select 1 from public.profiles where id = target_user_id and role = 'admin' and is_active = true)
    and not exists (select 1 from public.profiles where id <> target_user_id and role = 'admin' and is_active = true) then
    raise exception 'last_admin';
  end if;
  delete from auth.users where id = target_user_id;
end;
$$;

revoke execute on function public.delete_managed_user(uuid) from public;
grant execute on function public.delete_managed_user(uuid) to authenticated;

-- İlk admini Supabase Dashboard > Authentication > Users bölümünde oluşturun.
-- E-posta onayını kapattıktan sonra aşağıdaki satırda gerçek e-postayı kullanın:
-- update public.profiles set role = 'admin', is_active = true where username = 'admin';

-- Uygulama içinden yeni kullanıcı eklemek için:
-- Authentication > Providers > Email bölümünde Confirm email seçeneğini kapatın.
