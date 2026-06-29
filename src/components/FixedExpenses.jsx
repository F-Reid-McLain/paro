import { useEffect, useMemo, useState } from 'react'
import { updateFixedExpense, deleteFixedExpense } from '../lib/api'

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
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId])

  useEffect(() => {
    let mounted = true
    async function loadGroups() {
      if (!supabase) return
      try {
        const { data } = await supabase.from('groups').select('*')
        if (!mounted) return
        setGroups(data || [])
        if (data?.length) setGroupId((currentGroup?.id) || data[0].id)
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
      if (!supabase || !groupId) { if (mounted) setItems([]); return }
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('fixed_expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
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

  function startEdit(item) {
    setEditDraft({
      name: item.name,
      amount: (Number(item.amount) / 100).toFixed(2),
      period: item.period,
      end_date: item.end_date || '',
    })
    setEditingId(item.id)
  }

  async function handleSaveEdit(id) {
    const parsed = parseFloat(editDraft.amount)
    if (!editDraft.name.trim() || Number.isNaN(parsed) || parsed <= 0) {
      alert('Enter a valid name and amount')
      return
    }
    setSavingEdit(true)
    try {
      const updated = await updateFixedExpense(supabase, id, {
        name: editDraft.name.trim(),
        amount: Math.round(parsed * 100),
        period: editDraft.period,
        end_date: editDraft.end_date || null,
      })
      setItems((prev) => prev.map((item) => item.id === id ? updated : item))
      setEditingId(null)
      if (onChanged) onChanged(groupId)
    } catch (e) {
      console.error('update fixed expense', e)
      alert(e.message || 'Failed to update')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    setDeletingId(item.id)
    try {
      await deleteFixedExpense(supabase, item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      if (onChanged) onChanged(groupId)
    } catch (e) {
      console.error('delete fixed expense', e)
      alert(e.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xl font-semibold text-hi">Fixed Bills</h2>
        {selectedGroup && <span className="text-xs text-dim">{selectedGroup.name}</span>}
      </div>

      {/* Add form */}
      <form onSubmit={handleSubmit} className="border-2 border-def bg-card p-4 space-y-3">
        <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Add fixed bill</h3>
        <select
          className="w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi"
          value={groupId}
          onChange={(e) => {
            const nextGroupId = e.target.value
            setGroupId(nextGroupId)
            if (onGroupChange) onGroupChange(groups.find((g) => g.id === nextGroupId) || null)
          }}
        >
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input
          className="w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi placeholder:text-faint"
          placeholder="Bill name (e.g. Rent, Netflix)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            inputMode="decimal"
            type="number"
            step="0.01"
            className="w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi placeholder:text-faint"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            className="w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
            <option value="one-time">One-time</option>
          </select>
        </div>
        <input
          type="date"
          className="w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End date (optional)"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-hi disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Add bill'}
          </button>
        </div>
      </form>

      {/* List */}
      <div className="border-2 border-def bg-card p-4">
        <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim mb-3">Current bills</h3>
        {loading ? (
          <p className="text-sm text-dim">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-dim">No fixed bills yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              if (editingId === item.id) {
                return (
                  <li key={item.id} className="border-2 border-accent bg-deep p-3 space-y-2">
                    <input
                      className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                      placeholder="Bill name"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                        placeholder="Amount"
                        value={editDraft.amount}
                        onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                      />
                      <select
                        className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                        value={editDraft.period}
                        onChange={(e) => setEditDraft((d) => ({ ...d, period: e.target.value }))}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="yearly">Yearly</option>
                        <option value="one-time">One-time</option>
                      </select>
                    </div>
                    <input
                      type="date"
                      className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                      value={editDraft.end_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, end_date: e.target.value }))}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-def px-3 py-1.5 text-xs text-lo"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => handleSaveEdit(item.id)}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li key={item.id} className="flex items-center justify-between border-2 border-def bg-deep px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-hi truncate">{item.name}</p>
                    <p className="text-xs text-dim">{item.period}{item.end_date ? ` · ends ${item.end_date}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium text-hi">${(Number(item.amount) / 100).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-def px-2.5 py-1 text-xs text-lo hover:bg-input hover:text-hi transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item)}
                      className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === item.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
