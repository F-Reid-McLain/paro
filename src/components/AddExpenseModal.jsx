import { useEffect, useState } from 'react'
import { createExpense } from '../lib/api'

export default function AddExpenseModal({ open, onClose, supabase, onCreated, user }) {
  if (!open) return null

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
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

  async function handleSave() {
    const parsed = parseFloat(amount)
    if (Number.isNaN(parsed) || parsed <= 0) {
      alert('Enter a valid amount greater than 0')
      return
    }

    setSaving(true)
    try {
      const expense = {
        group_id: groupId,
        amount: Math.round(parsed * 100),
        description: description || null,
        occurred_at: new Date().toISOString(),
      }

      const created = await createExpense(supabase, expense, [])
      onCreated && onCreated(created)
      onClose()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to create expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-lg rounded-xl bg-slate-900 p-6">
        <h3 className="text-lg font-medium text-white">Record a new expense</h3>
        <p className="text-sm text-slate-300 mt-2">Quick capture form.</p>

        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); handleSave() }}>
          {groups.length ? (
            <select className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <div className="text-sm text-slate-300">No groups found. Create one to start sharing expenses.</div>
          )}

          <input inputMode="decimal" type="number" step="0.01" className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
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
