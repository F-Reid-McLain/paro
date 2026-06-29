import { useEffect, useState } from 'react'
import Groups from './Groups'
import { leaveGroup, deleteGroup } from '../lib/api'

export default function Settings({ supabase, user, currentGroup, onGroupChange }) {
  // Profile
  const [profileName, setProfileName] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Group members + invite
  const [groupMembers, setGroupMembers] = useState([])
  const [copied, setCopied] = useState(false)

  // Groups list
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [updates, setUpdates] = useState({})
  const [acting, setActing] = useState(null)

  // Sign out
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!supabase || !user?.id) return
    supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
      .then(({ data }) => { if (data?.full_name) setProfileName(data.full_name) })
      .catch(console.error)
  }, [supabase, user?.id])

  useEffect(() => {
    if (!supabase) return
    setLoadingGroups(true)
    supabase.from('group_members').select('group_id, groups(*)')
      .then(({ data, error }) => {
        if (!error) setGroups((data || []).map((row) => row.groups))
      })
      .catch(console.error)
      .finally(() => setLoadingGroups(false))
  }, [supabase])

  useEffect(() => {
    if (!supabase || !currentGroup?.id) { setGroupMembers([]); return }
    async function loadMembers() {
      const { data: memberRows } = await supabase
        .from('group_members').select('user_id, role').eq('group_id', currentGroup.id)
      if (!memberRows?.length) { setGroupMembers([]); return }
      const userIds = memberRows.map((m) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, email').in('id', userIds)
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]))
      setGroupMembers(memberRows.map((m) => ({
        userId: m.user_id,
        role: m.role,
        name: profileMap[m.user_id]?.full_name || profileMap[m.user_id]?.email?.split('@')[0] || 'Member',
        email: profileMap[m.user_id]?.email,
        isMe: m.user_id === user.id,
      })))
    }
    loadMembers().catch(console.error)
  }, [supabase, currentGroup?.id, user?.id])

  async function handleSaveName() {
    if (!profileName.trim()) return
    setSavingName(true)
    try {
      const { error } = await supabase
        .from('profiles').update({ full_name: profileName.trim() }).eq('id', user.id)
      if (error) throw error
    } catch (e) {
      alert(e.message || 'Failed to save name')
    } finally {
      setSavingName(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  function copySlug() {
    navigator.clipboard.writeText(currentGroup.slug).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
    if (!window.confirm(`Delete "${group.name}"? This removes all expenses and cannot be undone.`)) return
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
    if (!nextName?.trim()) return
    try {
      const { data, error } = await supabase
        .from('groups').update({ name: nextName.trim() }).eq('id', groupId).select().single()
      if (error) throw error
      setGroups((current) => current.map((g) => g.id === groupId ? data : g))
      setUpdates((prev) => ({ ...prev, [groupId]: undefined }))
      if (currentGroup?.id === groupId) onGroupChange && onGroupChange(data)
    } catch (e) {
      alert(e.message || 'Unable to update group name')
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-white">Settings</h2>

      {/* Account */}
      <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Account</h3>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-base font-semibold text-sky-300">
            {(profileName || user.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{profileName || 'No display name set'}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Display name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            className="flex-1 rounded-lg bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={savingName || !profileName.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h3.5a.75.75 0 010 1.5h-3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h3.5a.75.75 0 010 1.5h-3.5A2.75 2.75 0 012 11.25v-6.5zm9.47.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06-1.06l.97-.97H6.75a.75.75 0 010-1.5h5.69l-.97-.97a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      {/* Active group — members + invite */}
      {currentGroup && (
        <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Active group</h3>
            <span className="text-sm font-medium text-white">{currentGroup.name}</span>
          </div>

          {/* Member list */}
          {groupMembers.length > 0 && (
            <ul className="space-y-2">
              {groupMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 rounded-xl border border-white/8 bg-slate-900/50 px-3 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">
                    {m.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {m.name}{m.isMe ? <span className="ml-1.5 text-xs text-slate-500">you</span> : null}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{m.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-600/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Invite helper */}
          <div>
            <p className="mb-2 text-xs text-slate-400">Invite someone — share this group code</p>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 font-mono text-sm text-slate-300 truncate">
                {currentGroup.slug}
              </div>
              <button
                type="button"
                onClick={copySlug}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Your groups</h3>
        {loadingGroups ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-400">No groups yet. Create or join one below.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const isOwner = group.owner_id === user.id
              const draftName = updates[group.id] ?? group.name
              return (
                <div key={group.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{group.name}</p>
                      <span className="shrink-0 rounded-full border border-slate-600/80 bg-slate-950/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                        {isOwner ? 'Owner' : 'Member'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {currentGroup?.id !== group.id ? (
                        <button
                          type="button"
                          onClick={() => onGroupChange && onGroupChange(group)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Set active
                        </button>
                      ) : (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200">Active</span>
                      )}
                      {isOwner ? (
                        <button
                          type="button"
                          disabled={acting === group.id}
                          onClick={() => handleDelete(group)}
                          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 disabled:opacity-50 hover:bg-red-500/10 transition-colors"
                        >
                          {acting === group.id ? '…' : 'Delete'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={acting === group.id}
                          onClick={() => handleLeave(group)}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-400 disabled:opacity-50 hover:bg-slate-700 transition-colors"
                        >
                          {acting === group.id ? '…' : 'Leave'}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={draftName}
                        onChange={(e) => setUpdates((prev) => ({ ...prev, [group.id]: e.target.value }))}
                        className="flex-1 rounded-lg bg-slate-800 border border-white/10 px-3 py-1.5 text-sm text-slate-100"
                        placeholder="Group name"
                      />
                      <button
                        type="button"
                        disabled={!updates[group.id] || updates[group.id].trim() === '' || updates[group.id] === group.name}
                        onClick={() => saveGroupName(group.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / join */}
      <Groups currentGroup={currentGroup} supabase={supabase} user={user} onGroupChange={onGroupChange} />
    </section>
  )
}
