export async function fetchExpenses(supabase, opts = {}) {
  const { fromDate, toDate } = opts
  let query = supabase.from('expenses').select('*')

  if (fromDate) query = query.gte('occurred_at', fromDate)
  if (toDate) query = query.lte('occurred_at', toDate)

  const { data, error } = await query.order('occurred_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createExpense(supabase, expense, shares = []) {
  // ensure required fields
  if (!expense.group_id) throw new Error('group_id is required')
  // normalize date: DB expects `date` (date only)
  if (!expense.date) {
    if (expense.occurred_at) {
      expense.date = expense.occurred_at.split('T')[0]
      delete expense.occurred_at
    } else {
      expense.date = new Date().toISOString().split('T')[0]
    }
  }

  // Insert expense, then insert shares
  const { data: expData, error: expError } = await supabase.from('expenses').insert(expense).select().single()
  if (expError) throw expError

  if (shares && shares.length) {
    const prepared = shares.map((s) => ({ ...s, expense_id: expData.id }))
    const { error: sharesError } = await supabase.from('expense_shares').insert(prepared)
    if (sharesError) throw sharesError
  }

  return expData
}

export async function getUserGroups(supabase) {
  // fetch groups the user belongs to via group_members join
  const { data, error } = await supabase.from('group_members').select('group_id, groups(*)')
  if (error) throw error
  // map to group objects
  return (data || []).map((row) => row.groups)
}

export async function createGroup(supabase, { name, slug, owner_id }) {
  const { data, error } = await supabase.from('groups').insert({ name, slug, owner_id }).select().single()
  if (error) throw error
  // add owner to group_members
  const { error: gmErr } = await supabase.from('group_members').insert({ group_id: data.id, user_id: owner_id, role: 'owner' })
  if (gmErr) throw gmErr
  return data
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
