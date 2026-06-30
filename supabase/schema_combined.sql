-- Combined schema for Paro
-- Run this in the Supabase SQL editor for the target project.

create extension if not exists "pgcrypto";

-- ===== profiles =====

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

drop policy if exists "Group members can view each other's profiles" on public.profiles;
create policy "Group members can view each other's profiles" on public.profiles
for select using (
  auth.uid() = profiles.id or
  exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
  )
);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
for insert with check (auth.uid() = id);

-- ===== groups =====

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;

-- ===== group_members =====

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

alter table public.group_members enable row level security;

-- Helper: check membership without going through RLS.
-- SECURITY DEFINER breaks the groups↔group_members policy cycle.
create or replace function public.current_user_in_group(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  )
$$;

-- groups policies
drop policy if exists "Users can view their groups" on public.groups;
create policy "Users can view their groups" on public.groups
for select using (owner_id = auth.uid() or public.current_user_in_group(id));

drop policy if exists "Users can create groups" on public.groups;
create policy "Users can create groups" on public.groups
for insert with check (owner_id = auth.uid());

drop policy if exists "Owners can delete groups" on public.groups;
create policy "Owners can delete groups" on public.groups
for delete using (owner_id = auth.uid());

drop policy if exists "Owners can update groups" on public.groups;
create policy "Owners can update groups" on public.groups
for update using (owner_id = auth.uid());

-- group_members policies (no reference to groups — avoids the RLS cycle)
drop policy if exists "Members can view group membership" on public.group_members;
create policy "Members can view group membership" on public.group_members
for select using (public.current_user_in_group(group_id) or auth.uid() = user_id);

-- Only insert your own user_id; slug-based joins go through join_group_by_slug (SECURITY DEFINER)
drop policy if exists "Members can insert group membership" on public.group_members;
create policy "Members can insert group membership" on public.group_members
for insert with check (auth.uid() = user_id);

drop policy if exists "Members can leave groups" on public.group_members;
create policy "Members can leave groups" on public.group_members
for delete using (auth.uid() = user_id);

-- ===== expenses =====

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

alter table public.expenses enable row level security;

drop policy if exists "Members can view expenses" on public.expenses;
create policy "Members can view expenses" on public.expenses
for select using (public.current_user_in_group(group_id) or exists (
  select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
));

drop policy if exists "Members can insert expenses" on public.expenses;
create policy "Members can insert expenses" on public.expenses
for insert with check (
  auth.uid() = payer_id and (
    public.current_user_in_group(group_id) or exists (
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

-- ===== expense_shares =====

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
    select 1 from public.expenses e
    where e.id = expense_id and public.current_user_in_group(e.group_id)
  ) or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert shares" on public.expense_shares;
create policy "Members can insert shares" on public.expense_shares
for insert with check (
  exists (
    select 1 from public.expenses e
    where e.id = expense_id and public.current_user_in_group(e.group_id)
  ) or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can update their own share settled flag" on public.expense_shares;
create policy "Members can update their own share settled flag" on public.expense_shares
for update using (
  auth.uid() = user_id
  or exists (
    select 1 from public.expenses e where e.id = expense_id and e.payer_id = auth.uid()
  )
  or exists (
    select 1 from public.expenses e join public.groups g on g.id = e.group_id
    where e.id = expense_id and g.owner_id = auth.uid()
  )
);

-- ===== fixed_expenses =====

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  amount numeric not null,
  currency text default 'USD',
  period text not null,
  start_date date default now(),
  end_date date,
  is_split boolean default false,
  created_at timestamptz default now()
);

alter table public.fixed_expenses enable row level security;

drop policy if exists "Members can view fixed expenses" on public.fixed_expenses;
create policy "Members can view fixed expenses" on public.fixed_expenses
for select using (
  public.current_user_in_group(group_id) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can insert fixed expenses" on public.fixed_expenses;
create policy "Members can insert fixed expenses" on public.fixed_expenses
for insert with check (
  public.current_user_in_group(group_id) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can delete fixed expenses" on public.fixed_expenses;
create policy "Members can delete fixed expenses" on public.fixed_expenses
for delete using (
  public.current_user_in_group(group_id) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can update fixed expenses" on public.fixed_expenses;
create policy "Members can update fixed expenses" on public.fixed_expenses
for update using (
  public.current_user_in_group(group_id) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- ===== payments =====

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  payer_id uuid not null references auth.users(id) on delete cascade,
  payee_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz default now()
);

alter table public.payments enable row level security;

drop policy if exists "Group members can view payments" on public.payments;
create policy "Group members can view payments" on public.payments
for select using (
  public.current_user_in_group(group_id) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

drop policy if exists "Members can record payments" on public.payments;
create policy "Members can record payments" on public.payments
for insert with check (
  (auth.uid() = payer_id or auth.uid() = payee_id) and (
    public.current_user_in_group(group_id) or exists (
      select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
    )
  )
);

-- ===== fixed_expense_payments =====

create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_label text not null,
  amount numeric not null,
  created_at timestamptz default now(),
  unique (fixed_expense_id, user_id, period_label)
);

alter table public.fixed_expense_payments enable row level security;

drop policy if exists "Members can view fixed expense payments" on public.fixed_expense_payments;
create policy "Members can view fixed expense payments" on public.fixed_expense_payments
for select using (
  exists (
    select 1 from public.fixed_expenses fe
    where fe.id = fixed_expense_id and public.current_user_in_group(fe.group_id)
  )
);

drop policy if exists "Members can record fixed expense payments" on public.fixed_expense_payments;
create policy "Members can record fixed expense payments" on public.fixed_expense_payments
for insert with check (auth.uid() = user_id);

-- ===== functions =====

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

-- RPC: join a group by slug (SECURITY DEFINER so the lookup bypasses RLS)
create or replace function public.join_group_by_slug(p_slug text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where slug = p_slug limit 1;
  if not found then
    raise exception 'Group not found';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return row_to_json(v_group);
end;
$$;

-- ===== expense_audit_log =====
-- User-owned immutable log. Persists after leaving/deleting groups.
-- Records every create, update, delete with a data snapshot.

create table if not exists public.expense_audit_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  group_id     uuid,        -- nullable: group may be deleted later
  group_name   text,        -- snapshot so name is preserved even if group deleted
  expense_id   uuid,        -- nullable: expense may be deleted later
  action       text not null check (action in ('created', 'updated', 'deleted')),
  expense_type text not null default 'expense' check (expense_type in ('expense', 'fixed')),
  description  text,
  amount       numeric,
  category     text,
  date         date,
  recorded_at  timestamptz default now()
);

alter table public.expense_audit_log enable row level security;

drop policy if exists "Users can view own audit log" on public.expense_audit_log;
create policy "Users can view own audit log" on public.expense_audit_log
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own audit log" on public.expense_audit_log;
create policy "Users can insert own audit log" on public.expense_audit_log
for insert with check (auth.uid() = user_id);

-- End combined schema
