-- Stage 2 schema for Paro: expenses, expense_shares, fixed_expenses
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

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
  period text, -- 'monthly', 'yearly', 'weekly', etc. used for fixed expenses
  created_at timestamptz default now()
);

alter table public.expenses add column if not exists is_split boolean default false;
alter table public.expenses enable row level security;

-- Members of the group (owner or group_members) can SELECT
create policy "Members can view expenses" on public.expenses
for select using (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- Insert: payer must be the authenticated user and must belong to the group (or be owner)
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

-- Update/Delete: only the payer or group owner can modify or remove an expense
create policy "Payer or owner can update expenses" on public.expenses
for update using (
  auth.uid() = payer_id or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

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
  period text not null, -- 'monthly','yearly','weekly'
  start_date date default now(),
  end_date date,
  created_at timestamptz default now()
);

alter table public.fixed_expenses enable row level security;

create policy "Members can view fixed expenses" on public.fixed_expenses
for select using (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

create policy "Members can insert fixed expenses" on public.fixed_expenses
for insert with check (
  exists (
    select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()
  ) or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()
  )
);

-- Example seed (commented):
-- insert into public.expenses (group_id, payer_id, amount, date, description, category)
-- values ('<group-uuid>','<user-uuid>', 42.50, '2026-06-01', 'Electric bill', 'Utilities');
