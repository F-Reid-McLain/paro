import { useEffect, useState } from 'react'
import { createExpense, createFixedExpense } from '../lib/api'

export default function AddExpenseModal({ open, onClose, supabase, onCreated, user, currentGroup }) {
  if (!open) return null

  const [mode, setMode] = useState('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState('')
  const [isSplit, setIsSplit] = useState(false)
  const [name, setName] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  useEffect(() => {
    let mounted = true
    async function loadGroups() {
      try {
        const { data } = await supabase.from('groups').select('*')
        if (!mounted) return
        setGroups(data || [])
        if (data && data.length) setGroupId(data[0].id)
      } catch (e) {
        console.error('load groups', e)
      }
    }
    loadGroups()
    return () => { mounted = false }
  }, [supabase])

  useEffect(() => {
    if (currentGroup) setGroupId(currentGroup.id)
  }, [currentGroup])

  async function handleSave() {
    const parsed = parseFloat(amount)
    if (Number.isNaN(parsed) || parsed <= 0) {
      alert('Enter a valid amount greater than 0')
      return
    }

    setSaving(true)
    try {
      if (mode === 'fixed') {
        if (!name.trim()) {
          alert('Enter a name for the fixed expense')
          return
        }
        const payload = {
          group_id: groupId,
          name: name.trim(),
          amount: Math.round(parsed * 100),
          period,
          start_date: startDate,
          end_date: endDate || null,
          currency: 'USD',
        }
        const created = await createFixedExpense(supabase, payload)
        onCreated && onCreated(created)
      } else {
        const expense = {
          group_id: groupId,
          payer_id: user?.id,
          amount: Math.round(parsed * 100),
          description: description || null,
          category: category || null,
          date: expenseDate,
          is_split: isSplit,
        }
        const created = await createExpense(supabase, expense, [])
        onCreated && onCreated(created)
      }
      onClose()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-lg rounded-xl bg-slate-900 p-6">
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 p-2">
          <button
            type="button"
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mode === 'expense' ? 'bg-sky-500 text-white' : 'text-slate-300'}`}
            onClick={() => setMode('expense')}
          >
            Expense
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mode === 'fixed' ? 'bg-sky-500 text-white' : 'text-slate-300'}`}
            onClick={() => setMode('fixed')}
          >
            Fixed
          </button>
        </div>

        <h3 className="text-lg font-medium text-white">{mode === 'fixed' ? 'Add fixed expense' : 'Record a new expense'}</h3>
        <p className="text-sm text-slate-300 mt-2">{mode === 'fixed' ? 'Save a repeating bill or subscription.' : 'Quickly capture a one-time cost.'}</p>

        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); handleSave() }}>
          {groups.length ? (
            <select className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <div className="text-sm text-slate-300">No groups found. Create one to start sharing expenses.</div>
          )}

          {mode === 'fixed' ? (
            <>
              <input
                className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100"
                placeholder="Fixed expense name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <select className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one-time">One-time</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="date" className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date (optional)" />
              </div>
            </>
          ) : (
            <>
              <input inputMode="decimal" type="number" step="0.01" className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input type="date" className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              <select className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select a category</option>
                <option value="Food">Food</option>
                <option value="Housing">Housing</option>
                <option value="Transport">Transport</option>
                <option value="Utilities">Utilities</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Shopping">Shopping</option>
                <option value="Other">Other</option>
              </select>
              <input className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} />
                Split cost
              </label>
            </>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="ml-auto rounded bg-sky-500 px-4 py-2 text-white">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="rounded border border-white/6 px-4 py-2 text-slate-200" onClick={onClose}>Cancel</button>
          </div>
        </form>
        {!groups.length && (
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={creatingGroup} onClick={async () => {
              setCreatingGroup(true)
              try {
                const name = 'My Group'
                const slug = 'my-group-' + Math.random().toString(36).slice(2,7)
                const owner_id = user?.id
                const { data, error } = await supabase.from('groups').insert({ name, slug, owner_id }).select().single()
                if (error) throw error
                setGroups([data])
                setGroupId(data.id)
              } catch (e) {
                console.error('create group', e)
                alert(e.message || 'Failed to create group')
              } finally {
                setCreatingGroup(false)
              }
            }} className="rounded bg-emerald-500 px-3 py-2 text-white">Create group</button>
          </div>
        )}
      </div>
    </div>
  )
}
