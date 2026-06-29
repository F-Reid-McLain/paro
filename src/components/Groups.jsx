import { useEffect, useState } from 'react'
import { getUserGroups, createGroup, joinGroup } from '../lib/api'

export default function Groups({ supabase, user, currentGroup, onGroupChange }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [joinSlug, setJoinSlug] = useState('')

  async function load() {
    setLoading(true)
    try {
      const rows = await getUserGroups(supabase)
      setGroups(rows)
    } catch (e) {
      console.error('load groups', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (currentGroup) return alert('Leave your current group before creating or joining another one.')
    if (!name) return alert('Name required')
    try {
      const g = await createGroup(supabase, { name, slug: slug || name.toLowerCase().replace(/\s+/g,'-'), owner_id: user.id })
      setName('')
      setSlug('')
      setGroups((s) => [g, ...s])
      onGroupChange && onGroupChange(g)
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to create group')
    }
  }

  async function handleJoin() {
    if (currentGroup) return alert('Leave your current group before creating or joining another one.')
    if (!joinSlug) return alert('Enter group slug to join')
    try {
      const g = await joinGroup(supabase, { slug: joinSlug, user_id: user.id })
      setJoinSlug('')
      setGroups((s) => [g, ...s])
      onGroupChange && onGroupChange(g)
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to join group')
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Groups</h2>
      </div>

      <p className="text-slate-300 mt-2">Create a group or join an existing group's slug to share expenses.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-white/6 bg-slate-800 p-4">
          <h3 className="text-sm text-slate-200">Create group</h3>
          <input className="mt-2 w-full rounded bg-slate-700 px-3 py-2 text-white" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!currentGroup} />
          <input className="mt-2 w-full rounded bg-slate-700 px-3 py-2 text-white" placeholder="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!currentGroup} />
          <div className="mt-3 text-right">
            <button onClick={handleCreate} className="rounded bg-emerald-500 px-3 py-2 text-white" disabled={!!currentGroup}>Create</button>
          </div>
          {currentGroup ? <p className="mt-3 text-sm text-amber-300">Leave your current group before creating a new one.</p> : null}
        </div>

        <div className="rounded border border-white/6 bg-slate-800 p-4">
          <h3 className="text-sm text-slate-200">Join group</h3>
          <input className="mt-2 w-full rounded bg-slate-700 px-3 py-2 text-white" placeholder="Group slug" value={joinSlug} onChange={(e) => setJoinSlug(e.target.value)} disabled={!!currentGroup} />
          <div className="mt-3 text-right">
            <button onClick={handleJoin} className="rounded bg-sky-500 px-3 py-2 text-white" disabled={!!currentGroup}>Join</button>
          </div>
          {currentGroup ? <p className="mt-3 text-sm text-amber-300">Leave your current group before joining another one.</p> : null}
        </div>
      </div>

      <div className="mt-6 rounded border border-white/6 bg-slate-800 p-4 text-slate-200">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-slate-400">You are not a member of any groups yet.</div>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded bg-slate-900/40 p-3">
                <div>
                  <div className="font-medium text-white">{g.name}</div>
                  <div className="text-sm text-slate-400">{g.slug}</div>
                </div>
                <div className="text-sm text-slate-300">{g.owner_id === user.id ? 'Owner' : 'Member'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
