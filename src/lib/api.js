export async function fetchExpenses(supabase, opts = {}) {
  const { fromDate, toDate } = opts
  let query = supabase.from('expenses').select('*')

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (opts.group_id) query = query.eq('group_id', opts.group_id)

  const { data, error } = await query.order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchUserExpenseShares(supabase, expenseIds = [], userId) {
  if (!expenseIds.length || !userId) return []

  const { data, error } = await supabase
    .from('expense_shares')
    .select('*')
    .in('expense_id', expenseIds)
    .eq('user_id', userId)

  if (error) throw error
  return data || []
}

export async function settleExpenseShare(supabase, shareId) {
  const { data, error } = await supabase
    .from('expense_shares')
    .update({ settled: true })
    .eq('id', shareId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createExpense(supabase, expense, shares = []) {
  // ensure required fields
  if (!expense.group_id) throw new Error('group_id is required')

  let payerId = expense.payer_id
  if (!payerId) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    payerId = authData?.user?.id
  }
  if (!payerId) throw new Error('Unable to determine current user')

  // normalize date: DB expects `date` (date only)
  const normalizedExpense = {
    ...expense,
    payer_id: payerId,
    date: expense.date || (expense.occurred_at ? expense.occurred_at.split('T')[0] : new Date().toISOString().split('T')[0]),
  }
  if (normalizedExpense.occurred_at) delete normalizedExpense.occurred_at

  // Insert expense, then insert shares
  const { data: expData, error: expError } = await supabase.from('expenses').insert(normalizedExpense).select().single()
  if (expError) throw expError

  if (normalizedExpense.is_split) {
    const { data: membersData, error: membersError } = await supabase.from('group_members').select('user_id').eq('group_id', expense.group_id)
    if (membersError) throw membersError

    const memberIds = (membersData || []).map((m) => m.user_id).filter(Boolean)
    const otherMembers = memberIds.filter((id) => id !== payerId)
    const totalMembers = otherMembers.length + 1
    const shareAmount = Math.round((Number(expense.amount) || 0) / totalMembers)

    if (otherMembers.length) {
      const prepared = otherMembers.map((userId) => ({
        expense_id: expData.id,
        user_id: userId,
        amount: shareAmount,
        settled: false,
      }))

      const { error: sharesError } = await supabase.from('expense_shares').insert(prepared)
      if (sharesError) throw sharesError
    }
  } else if (shares && shares.length) {
    const prepared = shares.map((s) => ({ ...s, expense_id: expData.id }))
    const { error: sharesError } = await supabase.from('expense_shares').insert(prepared)
    if (sharesError) throw sharesError
  }

  return expData
}

export async function createFixedExpense(supabase, fixedExpense) {
  const { data, error } = await supabase.from('fixed_expenses').insert(fixedExpense).select().single()
  if (error) throw error
  return data
}

export async function getUserGroups(supabase) {
  // fetch groups the user belongs to via group_members join
  const { data, error } = await supabase.from('group_members').select('group_id, groups(*)')
  if (error) throw error
  // map to group objects
  return (data || []).map((row) => row.groups)
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50)
}

function isUniqueViolation(err) {
  if (!err) return false
  return err.code === '23505' || (err.message && /duplicate key/i.test(err.message)) || (err.details && /already exists/i.test(err.details))
}

export async function createGroup(supabase, { name, slug, owner_id }) {
  const baseSlug = slug && slug.length ? slugify(slug) : slugify(name || 'group')

  // try insert, on duplicate try a few variants
  let attempt = 0
  let lastErr = null
  while (attempt < 5) {
    const trySlug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase.from('groups').insert({ name, slug: trySlug, owner_id }).select().single()
    if (!error && data) {
      // add owner to group_members
      const { error: gmErr } = await supabase.from('group_members').insert({ group_id: data.id, user_id: owner_id, role: 'owner' })
      if (gmErr) throw gmErr
      return data
    }

    lastErr = error
    if (!isUniqueViolation(error)) break
    attempt += 1
  }

  // if we reach here, surface the last error
  throw lastErr || new Error('Failed to create group')
}

export async function joinGroup(supabase, { slug, user_id }) {
  const { data: groups, error: gErr } = await supabase.from('groups').select('*').eq('slug', slug).limit(1)
  if (gErr) throw gErr
  if (!groups || groups.length === 0) throw new Error('Group not found')
  const group = groups[0]
  const { data, error } = await supabase.from('group_members').insert({ group_id: group.id, user_id, role: 'member' }).select().single()
  if (error) throw error
  return group
}

export async function leaveGroup(supabase, { groupId, userId }) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function deleteGroup(supabase, groupId) {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId)
  if (error) throw error
}

export async function fetchMyUnsettledShares(supabase, { groupId, userId }) {
  const { data: expenses, error: expErr } = await supabase
    .from('expenses')
    .select('id, description, payer_id, date, amount')
    .eq('group_id', groupId)
  if (expErr) throw expErr
  if (!expenses?.length) return []

  const expenseIds = expenses.map((e) => e.id)
  const expenseMap = Object.fromEntries(expenses.map((e) => [e.id, e]))

  const { data: shares, error: sharesErr } = await supabase
    .from('expense_shares')
    .select('id, expense_id, amount')
    .in('expense_id', expenseIds)
    .eq('user_id', userId)
    .eq('settled', false)
  if (sharesErr) throw sharesErr

  return (shares || []).map((share) => ({
    shareId: share.id,
    shareAmount: Number(share.amount),
    expense: expenseMap[share.expense_id],
  }))
}

export async function getMemberProfiles(supabase, groupId) {
  const { data: memberRows, error: mErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
  if (mErr) throw mErr

  const userIds = (memberRows || []).map((m) => m.user_id).filter(Boolean)
  if (!userIds.length) return {}

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
  if (pErr) throw pErr

  const map = {}
  for (const p of profiles || []) {
    map[p.id] = {
      name: p.full_name || p.email?.split('@')[0] || 'Member',
      email: p.email,
    }
  }
  return map
}

export async function fetchGroupBalances(supabase, { groupId, currentUserId }) {
  const { data: expenses, error: expErr } = await supabase
    .from('expenses')
    .select('id, payer_id')
    .eq('group_id', groupId)
  if (expErr) throw expErr
  if (!expenses?.length) return {}

  const expenseIds = expenses.map((e) => e.id)
  const payerByExpense = Object.fromEntries(expenses.map((e) => [e.id, e.payer_id]))

  const { data: shares, error: sharesErr } = await supabase
    .from('expense_shares')
    .select('expense_id, user_id, amount')
    .in('expense_id', expenseIds)
    .eq('settled', false)
  if (sharesErr) throw sharesErr

  const balances = {}
  for (const share of shares || []) {
    const debtorId = share.user_id
    const creditorId = payerByExpense[share.expense_id]
    const amount = Number(share.amount)

    if (debtorId === currentUserId) {
      // I owe this person
      balances[creditorId] = (balances[creditorId] || 0) - amount
    } else if (creditorId === currentUserId) {
      // This person owes me
      balances[debtorId] = (balances[debtorId] || 0) + amount
    }
  }

  return balances
}

export async function settleUp(supabase, { groupId, withUserId, currentUserId }) {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, payer_id')
    .eq('group_id', groupId)
    .in('payer_id', [withUserId, currentUserId])
  if (error) throw error

  const paidByThem = (expenses || []).filter((e) => e.payer_id === withUserId).map((e) => e.id)
  const paidByMe = (expenses || []).filter((e) => e.payer_id === currentUserId).map((e) => e.id)

  if (paidByThem.length) {
    const { error: e1 } = await supabase
      .from('expense_shares')
      .update({ settled: true })
      .in('expense_id', paidByThem)
      .eq('user_id', currentUserId)
      .eq('settled', false)
    if (e1) throw e1
  }

  if (paidByMe.length) {
    const { error: e2 } = await supabase
      .from('expense_shares')
      .update({ settled: true })
      .in('expense_id', paidByMe)
      .eq('user_id', withUserId)
      .eq('settled', false)
    if (e2) throw e2
  }
}
