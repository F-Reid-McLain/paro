import { useEffect, useState } from 'react'
import Groups from './Groups'
import { leaveGroup, deleteGroup } from '../lib/api'

export default function Settings({ supabase, user, currentGroup, onGroupChange }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [updates, setUpdates] = useState({})
  const [acting, setActing] = useState(null)

  async function loadGroups() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('group_members').select('group_id, groups(*)')
      if (error) throw error
      setGroups((data || []).map((row) => row.groups))
    } catch (e) {
      console.error('load groups', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) return
    loadGroups()
  }, [supabase])

  async function handleLeave(group) {
    if (!window.confirm(`Leave "${group.name}"? You can rejoin with the group slug.`)) return
    setActing(group.id)
    try {
      await leaveGroup(supabase, { groupId: group.id, userId: user.id })
      setGroups((g) => g.filter((x) => x.id !== group.id))
      if (currentGroup?.id === group.id) onGroupChange && onGroupChange(null)
    } catch (e) {
      alert(e.message || 'Failed to leave group')
    } finally {
      setActing(null)
    }
  }

  async function handleDelete(group) {
    if (!window.confirm(`Delete "${group.name}"? This will permanently remove all expenses and shares. This cannot be undone.`)) return
    setActing(group.id)
    try {
      await deleteGroup(supabase, group.id)
      setGroups((g) => g.filter((x) => x.id !== group.id))
      if (currentGroup?.id === group.id) onGroupChange && onGroupChange(null)
    } catch (e) {
      alert(e.message || 'Failed to delete group')
    } finally {
      setActing(null)
    }
  }

  async function saveGroupName(groupId) {
    const nextName = updates[groupId]
    if (!nextName || nextName.trim().length === 0) return
    try {
      const { data, error } = await supabase.from('groups').update({ name: nextName.trim() }).eq('id', groupId).select().single()
      if (error) throw error
      setGroups((current) => current.map((group) => group.id === groupId ? data : group))
      setUpdates((prev) => ({ ...prev, [groupId]: undefined }))
      if (currentGroup?.id === groupId && onGroupChange) {
        onGroupChange(data)
      }
    } catch (e) {
      console.error('save group name', e)
      alert(e.message || 'Unable to update group name')
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Settings</h2>
          <p className="mt-2 text-slate-300">Manage your active group and update group details from one place.</p>
        </div>
        {currentGroup ? (
          <div className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-300">Active: {currentGroup.name}</div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-800/70 p-4">
        <h3 className="text-lg font-semibold text-white">About Paro</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Paro is a shared expense tracker for groups. Use the Monthly Ledger to record expenses, with fixed costs separated from variable spending so your group can see recurring and one-time items clearly.
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Create or join a group here to start sharing expenses with people you trust. Once you are in a group, all expense entries are attached to that group and shown together in the ledger.
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Use the + button to add a new expense. Fixed expenses appear under their own category in the monthly ledger, while variable expenses are logged normally.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-800/70 p-4">
        {loading ? (
          <div className="text-slate-400">Loading groups…</div>
        ) : groups.length === 0 ? (
          <div className="text-slate-400">No groups available yet. Create or join a group first.</div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const isOwner = group.owner_id === user.id
              const draftName = updates[group.id] ?? group.name
              return (
                <div key={group.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{group.name}</p>
                        <span className="rounded-full border border-slate-600/80 bg-slate-950/50 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">{isOwner ? 'Owner' : 'Member'}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Slug: {group.slug}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {currentGroup?.id !== group.id ? (
                        <button
                          type="button"
                          onClick={() => onGroupChange && onGroupChange(group)}
                          className="rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white"
                        >
                          Set active
                        </button>
                      ) : (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-200">Active group</span>
                      )}
                      {isOwner ? (
                        <button
                          type="button"
                          disabled={acting === group.id}
                          onClick={() => handleDelete(group)}
                          className="rounded border border-red-500/40 px-3 py-2 text-sm font-medium text-red-400 disabled:opacity-50"
                        >
                          {acting === group.id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={acting === group.id}
                          onClick={() => handleLeave(group)}
                          className="rounded border border-white/10 px-3 py-2 text-sm font-medium text-slate-400 disabled:opacity-50"
                        >
                          {acting === group.id ? 'Leaving…' : 'Leave'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>Group name</span>
                      <input
                        disabled={!isOwner}
                        value={draftName}
                        onChange={(e) => setUpdates((prev) => ({ ...prev, [group.id]: e.target.value }))}
                        className="w-full rounded bg-slate-800 px-3 py-2 text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!isOwner || !updates[group.id] || updates[group.id].trim() === '' || updates[group.id] === group.name}
                      onClick={() => saveGroupName(group.id)}
                      className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Save name
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-6">
        <Groups currentGroup={currentGroup} supabase={supabase} user={user} onGroupChange={onGroupChange} />
      </div>
    </section>
  )
}
