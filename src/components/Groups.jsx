import { useEffect, useState } from 'react'
import { getUserGroups, createGroup, joinGroup } from '../lib/api'
import { toast } from '../lib/toast'

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
    if (currentGroup) { toast('Leave your current group before creating or joining another one.'); return }
    if (!name) { toast('Name required'); return }
    try {
      const g = await createGroup(supabase, { name, slug: slug || name.toLowerCase().replace(/\s+/g,'-'), owner_id: user.id })
      setName('')
      setSlug('')
      setGroups((s) => [g, ...s])
      onGroupChange && onGroupChange(g)
    } catch (e) {
      console.error(e)
      toast(e.message || 'Failed to create group')
    }
  }

  async function handleJoin() {
    if (currentGroup) { toast('Leave your current group before creating or joining another one.'); return }
    if (!joinSlug) { toast('Enter a group slug to join'); return }
    try {
      const g = await joinGroup(supabase, { slug: joinSlug })
      setJoinSlug('')
      setGroups((s) => [g, ...s])
      onGroupChange && onGroupChange(g)
    } catch (e) {
      console.error(e)
      toast(e.message || 'Failed to join group')
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-hi">Groups</h2>
      </div>

      <p className="text-lo mt-2">Create a group or join an existing group's slug to share expenses.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="border-2 border-def bg-card p-4">
          <h3 className="text-sm text-lo">Create group</h3>
          <input className="mt-2 w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!currentGroup} />
          <input className="mt-2 w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi" placeholder="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!currentGroup} />
          <div className="mt-3 text-right">
            <button onClick={handleCreate} className="rounded-lg bg-emerald-500 px-3 py-2 text-hi" disabled={!!currentGroup}>Create</button>
          </div>
          {currentGroup ? <p className="mt-3 text-sm text-amber-300">Leave your current group before creating a new one.</p> : null}
        </div>

        <div className="border-2 border-def bg-card p-4">
          <h3 className="text-sm text-lo">Join group</h3>
          <input className="mt-2 w-full rounded-none border-2 border-def bg-input px-3 py-2 text-hi" placeholder="Group slug" value={joinSlug} onChange={(e) => setJoinSlug(e.target.value)} disabled={!!currentGroup} />
          <div className="mt-3 text-right">
            <button onClick={handleJoin} className="rounded-lg bg-accent px-3 py-2 text-hi" disabled={!!currentGroup}>Join</button>
          </div>
          {currentGroup ? <p className="mt-3 text-sm text-amber-300">Leave your current group before joining another one.</p> : null}
        </div>
      </div>

      <div className="mt-6 border-2 border-def bg-card p-4 text-lo">
        {loading ? (
          <div className="text-dim">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-dim">You are not a member of any groups yet.</div>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between bg-deep p-3">
                <div>
                  <div className="font-medium text-hi">{g.name}</div>
                  <div className="text-sm text-dim">{g.slug}</div>
                </div>
                <div className="text-sm text-lo">{g.owner_id === user.id ? 'Owner' : 'Member'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
