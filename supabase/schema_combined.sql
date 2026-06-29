-- Combined Stage 1 + Stage 2 schema for Paro
-- Run this in the Supabase SQL editor for the target project.

create extension if not exists "pgcrypto";

-- ===== STAGE 1: profiles, groups, group_members =====

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
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

drop policy if exists "Users can view their groups" on public.groups;
create policy "Users can view their groups" on public.groups
for select using (owner_id = auth.uid());

drop policy if exists "Users can create groups" on public.groups;
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

drop policy if exists "Members can view group membership" on public.group_members;
create policy "Members can view group membership" on public.group_members
for select using (
  auth.uid() = user_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert group membership" on public.group_members;
create policy "Members can insert group membership" on public.group_members
for insert with check (
  auth.uid() = user_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- ===== STAGE 2: expenses, expense_shares, fixed_expenses =====

-- Expenses table: one row per expense event
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  payer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  currency text default 'USD',
  date date not null,
  description text,
  category text,
  is_fixed boolean default false,
  is_split boolean default false,
  period text,
  created_at timestamptz default now()
);

alter table public.expenses add column if not exists is_split boolean default false;
alter table public.expenses enable row level security;

drop policy if exists "Members can view expenses" on public.expenses;
create policy "Members can view expenses" on public.expenses
for select using (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert expenses" on public.expenses;
create policy "Members can insert expenses" on public.expenses
for insert with check (
  auth.uid() = payer_id and (
    exists (
      select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
    ) or exists (
      select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
    )
  )
);

drop policy if exists "Payer or owner can update expenses" on public.expenses;
create policy "Payer or owner can update expenses" on public.expenses
for update using (
  auth.uid() = payer_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Payer or owner can delete expenses" on public.expenses;
create policy "Payer or owner can delete expenses" on public.expenses
for delete using (
  auth.uid() = payer_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- Expense shares: how each expense is split across users
create table if not exists public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  settled boolean default false,
  created_at timestamptz default now(),
  unique (expense_id, user_id)
);

alter table public.expense_shares enable row level security;

drop policy if exists "Members can view shares for their group expenses" on public.expense_shares;
create policy "Members can view shares for their group expenses" on public.expense_shares
for select using (
  exists (
    select 1 from public.expenses e join public.group_members gm on gm.group_id = e.group_id
    where e.id = expense_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert shares" on public.expense_shares;
create policy "Members can insert shares" on public.expense_shares
for insert with check (
  exists (
    select 1 from public.expenses e join public.group_members gm on gm.group_id = e.group_id
    where e.id = expense_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can update their own share settled flag" on public.expense_shares;
create policy "Members can update their own share settled flag" on public.expense_shares
for update using (
  auth.uid() = user_id or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

-- Fixed expenses: recurring items defined per group
create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  amount numeric not null,
  currency text default 'USD',
  period text not null,
  start_date date default now(),
  end_date date,
  created_at timestamptz default now()
);

alter table public.fixed_expenses enable row level security;

drop policy if exists "Members can view fixed expenses" on public.fixed_expenses;
create policy "Members can view fixed expenses" on public.fixed_expenses
for select using (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert fixed expenses" on public.fixed_expenses;
create policy "Members can insert fixed expenses" on public.fixed_expenses
for insert with check (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- ===== STAGE 3: profile visibility, payer settle rights, auto-create profile =====

-- Allow group members to see each other's profiles (needed for name display)
drop policy if exists "Group members can view each other's profiles" on public.profiles;
create policy "Group members can view each other's profiles" on public.profiles
for select using (
  auth.uid() = id or
  exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid() and gm2.user_id = id
  )
);

-- Allow expense payers to mark shares on their own expenses as settled
-- (so "settle up" works bidirectionally without requiring both parties to act)
drop policy if exists "Members can update their own share settled flag" on public.expense_shares;
create policy "Members can update their own share settled flag" on public.expense_shares
for update using (
  auth.uid() = user_id
  or exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.payer_id = auth.uid()
  )
  or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

-- Auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for any existing users who don't have one yet
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- End combined schema
