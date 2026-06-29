create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
for insert with check (auth.uid() = id);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;

create policy "Users can view their groups" on public.groups
for select using (owner_id = auth.uid());

create policy "Users can create groups" on public.groups
for insert with check (owner_id = auth.uid());

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "Members can view group membership" on public.group_members
for select using (
  auth.uid() = user_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);
