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
    const shareAmount = Math.round((Number(expense.amount) || 0) / 2)

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
