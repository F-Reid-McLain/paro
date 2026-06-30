import { useEffect, useState } from 'react'
import Groups from './Groups'
import { leaveGroup, deleteGroup, fetchAuditLog } from '../lib/api'

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

  // Export
  const [exporting, setExporting] = useState(false)

  // Theme
  const [activeTheme, setActiveTheme] = useState(
    () => localStorage.getItem('paro-theme') || 'midnight'
  )

  function handleThemeChange(themeId) {
    setActiveTheme(themeId)
    localStorage.setItem('paro-theme', themeId)
    document.documentElement.dataset.theme = themeId
  }

  const THEMES = [
    { id: 'midnight', name: 'Midnight', bg: '#020617', accent: '#0ea5e9' },
    { id: 'ocean',    name: 'Ocean',    bg: '#020c1b', accent: '#06b6d4' },
    { id: 'nord',     name: 'Nord',     bg: '#1a1f2e', accent: '#88c0d0' },
    { id: 'forest',   name: 'Forest',   bg: '#0b0a05', accent: '#22c55e' },
    { id: 'amber',    name: 'Amber',    bg: '#0e0a04', accent: '#f59e0b' },
    { id: 'dusk',     name: 'Dusk',     bg: '#0d0814', accent: '#f97316' },
    { id: 'rose',     name: 'Rose',     bg: '#110a0e', accent: '#f43f5e' },
    { id: 'ash',      name: 'Ash',      bg: '#111111', accent: '#6b7280' },
    { id: 'blackout', name: 'Blackout', bg: '#000000', accent: '#22c55e' },
    { id: 'chalk',    name: 'Chalk',    bg: '#f8f9fa', accent: '#3b82f6' },
    { id: 'paper',    name: 'Paper',    bg: '#f5f0e8', accent: '#c2410c' },
    { id: 'mint',     name: 'Mint',     bg: '#f0f7f4', accent: '#059669' },
  ]

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

  async function handleExportCSV() {
    setExporting(true)
    try {
      const rows = await fetchAuditLog(supabase)
      const headers = ['Date', 'Action', 'Type', 'Description', 'Category', 'Amount (USD)', 'Group']
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        headers.join(','),
        ...rows.map((r) => [
          r.recorded_at ? r.recorded_at.split('T')[0] : '',
          r.action,
          r.expense_type,
          escape(r.description || ''),
          escape(r.category || ''),
          r.amount != null ? (Number(r.amount) / 100).toFixed(2) : '',
          escape(r.group_name || ''),
        ].join(',')),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `paro-transactions-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e.message || 'Failed to export')
    } finally {
      setExporting(false)
    }
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
      <h2 className="font-pixel text-xl font-semibold text-hi">Settings</h2>

      {/* Account */}
      <div className="border-2 border-def bg-card p-5 space-y-4">
        <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Account</h3>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-hi" style={{ opacity: 0.85 }}>
            {(profileName || user.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-hi truncate">{profileName || 'No display name set'}</p>
            <p className="text-xs text-dim truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Display name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            className="flex-1 rounded-none bg-deep border-2 border-def px-3 py-2 text-sm text-hi placeholder:text-faint"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={savingName || !profileName.trim()}
            className="rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-hi disabled:opacity-50"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-def px-4 py-2.5 text-sm font-medium text-lo hover:bg-input hover:text-hi transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h3.5a.75.75 0 010 1.5h-3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h3.5a.75.75 0 010 1.5h-3.5A2.75 2.75 0 012 11.25v-6.5zm9.47.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06-1.06l.97-.97H6.75a.75.75 0 010-1.5h5.69l-.97-.97a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      {/* Appearance */}
      <div className="border-2 border-def bg-card p-5 space-y-4">
        <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Appearance</h3>
        <div className="grid grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const active = activeTheme === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleThemeChange(t.id)}
                className={`flex flex-col items-center gap-2 rounded-lg p-2 transition-opacity ${active ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
              >
                {/* Swatch: bg color fills square, accent dot in corner */}
                <div
                  className="relative h-12 w-full border-2"
                  style={{
                    backgroundColor: t.bg,
                    borderColor: active ? 'var(--paro-text-hi)' : 'var(--paro-border)',
                  }}
                >
                  <div
                    className="absolute bottom-1 right-1 h-3 w-3 rounded-full"
                    style={{ backgroundColor: t.accent }}
                  />
                </div>
                <span className="font-pixel text-[8px] leading-tight text-dim text-center">{t.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active group — members + invite */}
      {currentGroup && (
        <div className="border-2 border-def bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Active group</h3>
            <span className="text-sm font-medium text-hi">{currentGroup.name}</span>
          </div>

          {/* Member list */}
          {groupMembers.length > 0 && (
            <ul className="space-y-2">
              {groupMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 border-2 border-def bg-deep px-3 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-input text-xs font-semibold text-lo">
                    {m.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-hi truncate">
                      {m.name}{m.isMe ? <span className="ml-1.5 text-xs text-faint">you</span> : null}
                    </p>
                    <p className="text-xs text-faint truncate">{m.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-600/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-dim">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Invite helper */}
          <div>
            <p className="mb-2 text-xs text-dim">Invite someone — share this group code</p>
            <div className="flex gap-2">
              <div className="flex-1 border-2 border-def bg-deep px-3 py-2 font-mono text-sm text-lo truncate">
                {currentGroup.slug}
              </div>
              <button
                type="button"
                onClick={copySlug}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  copied ? 'bg-emerald-600 text-hi' : 'bg-input text-lo hover:bg-slate-600'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="border-2 border-def bg-card p-5">
        <h3 className="mb-4 font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Your groups</h3>
        {loadingGroups ? (
          <p className="text-sm text-dim">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-dim">No groups yet. Create or join one below.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const isOwner = group.owner_id === user.id
              const draftName = updates[group.id] ?? group.name
              return (
                <div key={group.id} className="border-2 border-def bg-deep p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-hi truncate">{group.name}</p>
                      <span className="shrink-0 rounded-full border border-slate-600/80 bg-page/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-dim">
                        {isOwner ? 'Owner' : 'Member'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {currentGroup?.id !== group.id ? (
                        <button
                          type="button"
                          onClick={() => onGroupChange && onGroupChange(group)}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi"
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
                          className="rounded-lg border border-def px-3 py-1.5 text-xs font-medium text-dim disabled:opacity-50 hover:bg-input transition-colors"
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
                        className="flex-1 rounded-none bg-card border-2 border-def px-3 py-1.5 text-sm text-hi"
                        placeholder="Group name"
                      />
                      <button
                        type="button"
                        disabled={!updates[group.id] || updates[group.id].trim() === '' || updates[group.id] === group.name}
                        onClick={() => saveGroupName(group.id)}
                        className="rounded-lg bg-accent-dark px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-40"
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

      {/* Data export */}
      <div className="border-2 border-def bg-card p-5 space-y-3">
        <h3 className="font-pixel text-[10px] font-semibold uppercase tracking-wider text-dim">Data</h3>
        <p className="text-sm text-lo">
          Download a full history of your transaction activity — including edited and deleted entries — as a CSV file.
          Your history is preserved even after leaving a group.
        </p>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-hi disabled:opacity-60"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
            <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.779a.749.749 0 1 1 1.06-1.06l1.97 1.97Z" />
          </svg>
          {exporting ? 'Exporting…' : 'Export transaction history'}
        </button>
      </div>
    </section>
  )
}
