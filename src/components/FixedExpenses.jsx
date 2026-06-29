import { useEffect, useMemo, useState } from 'react'

export default function FixedExpenses({ supabase, user, currentGroup, onChanged, onGroupChange }) {
  const [groupId, setGroupId] = useState('')
  const [groups, setGroups] = useState([])
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId])

  useEffect(() => {
    let mounted = true
    async function loadGroups() {
      if (!supabase) return
      try {
        const { data } = await supabase.from('groups').select('*')
        if (!mounted) return
        setGroups(data || [])
        if (data?.length) {
          setGroupId((currentGroup?.id) || data[0].id)
        }
      } catch (e) {
        console.error('load groups', e)
      }
    }
    loadGroups()
    return () => { mounted = false }
  }, [supabase, currentGroup?.id])

  useEffect(() => {
    let mounted = true
    async function loadItems() {
      if (!supabase || !groupId) {
        if (mounted) setItems([])
        return
      }
      setLoading(true)
      try {
        const { data, error } = await supabase.from('fixed_expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
        if (error) throw error
        if (mounted) setItems(data || [])
      } catch (e) {
        console.error('load fixed expenses', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadItems()
    return () => { mounted = false }
  }, [supabase, groupId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!groupId) return
    const parsed = parseFloat(amount)
    if (!name.trim() || Number.isNaN(parsed) || parsed <= 0) return

    setSaving(true)
    try {
      const payload = {
        group_id: groupId,
        name: name.trim(),
        amount: Math.round(parsed * 100),
        period,
        end_date: endDate || null,
        currency: 'USD',
      }
      const { data, error } = await supabase.from('fixed_expenses').insert(payload).select().single()
      if (error) throw error
      setItems((prev) => [data, ...prev])
      setName('')
      setAmount('')
      setPeriod('monthly')
      setEndDate('')
      if (onChanged) onChanged(groupId)
    } catch (e) {
      console.error('create fixed expense', e)
      alert(e.message || 'Failed to add fixed expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-hi">Fixed Expenses</h2>
          <p className="mt-2 text-lo">Manage recurring fixed expenses by period (monthly, yearly, etc.).</p>
        </div>
        {selectedGroup ? <div className="rounded bg-card px-3 py-2 text-sm text-lo">Group: {selectedGroup.name}</div> : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 rounded border border-def bg-card p-4 text-lo space-y-3">
        <select
          className="w-full rounded bg-page px-3 py-2 text-hi"
          value={groupId}
          onChange={(e) => {
            const nextGroupId = e.target.value
            setGroupId(nextGroupId)
            if (onGroupChange) {
              const nextGroup = groups.find((g) => g.id === nextGroupId) || null
              onGroupChange(nextGroup)
            }
          }}
        >
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <input className="w-full rounded bg-page px-3 py-2 text-hi" placeholder="Expense name" value={name} onChange={(e) => setName(e.target.value)} />
        <input inputMode="decimal" type="number" step="0.01" className="w-full rounded bg-page px-3 py-2 text-hi" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="w-full rounded bg-page px-3 py-2 text-hi" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="yearly">Yearly</option>
          <option value="one-time">One-time</option>
        </select>
        <label className="block text-sm text-lo">
          <span className="mb-1 block">End date (optional)</span>
          <input type="date" className="w-full rounded bg-page px-3 py-2 text-hi" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="submit" disabled={saving} className="rounded bg-sky-500 px-4 py-2 text-hi disabled:opacity-60">{saving ? 'Saving…' : 'Add fixed expense'}</button>
      </form>

      <div className="mt-6 rounded border border-def bg-card p-4 text-lo">
        {loading ? <div className="text-dim">Loading…</div> : items.length === 0 ? <div className="text-dim">No fixed expenses yet.</div> : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded bg-deep p-3">
                <div>
                  <div className="font-medium text-hi">{item.name}</div>
                  <div className="text-sm text-dim">{item.period}</div>
                </div>
                <div className="font-medium text-hi">${(Number(item.amount) / 100).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
