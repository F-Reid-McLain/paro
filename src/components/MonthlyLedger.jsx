import { useEffect, useRef, useState } from 'react'
import { fetchExpenseSharesWithMembers, setExpenseShareSettled, updateExpense } from '../lib/api'

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  )
}

export default function MonthlyLedger({
  expenses = [], loading = false, supabase, user, onRefresh, onDelete, members = {},
  splitFixed = [], selectedMonth, onMonthChange,
}) {
  const [userShares, setUserShares] = useState([])
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuSharesCache, setMenuSharesCache] = useState({})
  const [loadingMenuShares, setLoadingMenuShares] = useState(false)
  const [togglingShare, setTogglingShare] = useState(null)
  const [collapsed, setCollapsed] = useState(new Set())
  const [sortMode, setSortMode] = useState('recent')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    let mounted = true
    async function loadUserShares() {
      if (!supabase || !user?.id || !expenses.length) { if (mounted) setUserShares([]); return }
      try {
        const { data, error } = await supabase
          .from('expense_shares').select('*')
          .in('expense_id', expenses.map((e) => e.id))
          .eq('user_id', user.id)
        if (mounted) setUserShares(error ? [] : data || [])
      } catch (e) { console.error('load user shares', e) }
    }
    loadUserShares()
    return () => { mounted = false }
  }, [supabase, user?.id, expenses])

  useEffect(() => {
    if (!openMenuId) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  // Reset collapsed when expenses change (new month)
  useEffect(() => {
    setCollapsed(new Set(expenses.map((e) => e.category || 'Other')))
  }, [expenses])

  async function openMenu(expense) {
    const id = expense.id
    if (openMenuId === id) { setOpenMenuId(null); return }
    setOpenMenuId(id)
    if (expense.is_split && !menuSharesCache[id]) {
      setLoadingMenuShares(true)
      try {
        const shares = await fetchExpenseSharesWithMembers(supabase, id)
        setMenuSharesCache((prev) => ({ ...prev, [id]: shares }))
      } catch (e) { console.error('load expense shares', e) }
      finally { setLoadingMenuShares(false) }
    }
  }

  async function handleToggleShare(shareId, currentSettled, expenseId) {
    setTogglingShare(shareId)
    try {
      await setExpenseShareSettled(supabase, shareId, !currentSettled)
      const shares = await fetchExpenseSharesWithMembers(supabase, expenseId)
      setMenuSharesCache((prev) => ({ ...prev, [expenseId]: shares }))
      onRefresh && onRefresh()
    } catch (e) { console.error('toggle share', e); alert(e.message || 'Failed to update') }
    finally { setTogglingShare(null) }
  }

  function startEdit(expense) {
    setEditDraft({
      description: expense.description || '',
      amount: (expense.amount / 100).toFixed(2),
      date: expense.date || new Date().toISOString().split('T')[0],
      category: expense.category || '',
    })
    setEditingId(expense.id)
    setOpenMenuId(null)
  }

  async function handleSaveEdit(expenseId) {
    const parsed = parseFloat(editDraft.amount)
    if (Number.isNaN(parsed) || parsed <= 0) { alert('Enter a valid amount'); return }
    setSaving(true)
    try {
      await updateExpense(supabase, expenseId, {
        description: editDraft.description || null,
        amount: Math.round(parsed * 100),
        date: editDraft.date,
        category: editDraft.category || null,
      })
      setEditingId(null)
      onRefresh && onRefresh()
    } catch (e) {
      console.error('update expense', e)
      alert(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(expense) {
    if (!window.confirm(`Remove "${expense.description || 'this expense'}"?`)) return
    setOpenMenuId(null)
    onDelete && onDelete(expense.id, expense.is_fixed)
  }

  function toggleCategory(key) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Month navigation
  const now = new Date()
  const isCurrentMonth = selectedMonth
    ? selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth()
    : true
  const formattedMonth = selectedMonth
    ? selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
    : ''

  function prevMonth() {
    const d = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1)
    onMonthChange && onMonthChange(d)
  }
  function nextMonth() {
    const d = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1)
    onMonthChange && onMonthChange(d)
  }

  // Fixed-bill progress
  const splitCount = splitFixed.length
  const paidCount = splitFixed.filter((fe) => fe.paidThisPeriod).length
  const progressPct = splitCount > 0 ? Math.round((paidCount / splitCount) * 100) : 0
  const allPaid = splitCount > 0 && paidCount === splitCount

  const overallTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  // Sorted flat list (most recent first)
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)
  )

  // Grouped by category (sorted by highest total first)
  const byCategory = expenses.reduce((acc, e) => {
    const cat = e.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(e)
    return acc
  }, {})
  const sortedCategories = Object.entries(byCategory).sort(
    ([, a], [, b]) =>
      b.reduce((s, e) => s + Number(e.amount), 0) -
      a.reduce((s, e) => s + Number(e.amount), 0)
  )

  function getCategoryBadge(category = 'Other') {
    const c = String(category).toLowerCase()
    if (c.includes('rent') || c.includes('home') || c.includes('housing')) return 'border-violet-400/30 bg-violet-500/15 text-violet-200'
    if (c.includes('food') || c.includes('grocer') || c.includes('dine')) return 'border-amber-400/30 bg-amber-500/15 text-amber-200'
    if (c.includes('transport') || c.includes('gas') || c.includes('travel')) return 'border-sky-400/30 bg-sky-500/15 text-sky-200'
    if (c.includes('bill') || c.includes('utility') || c.includes('internet')) return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    if (c.includes('fixed')) return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    return 'border-def bg-input text-lo'
  }

  // Shared expense row renderer used by both views
  function renderEntry(e, showCatBadge = false) {
    const myShare = userShares.find((s) => s.expense_id === e.id)
    const canDelete = e.is_fixed || e.payer_id === user.id
    const canEdit = !e.is_fixed
    const isMenuOpen = openMenuId === e.id
    const isEditing = editingId === e.id
    const shares = menuSharesCache[e.id] || []

    if (isEditing) {
      return (
        <li key={e.id} className="border-2 border-accent bg-deep p-3 space-y-2">
          <input
            className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
            placeholder="Description"
            value={editDraft.description}
            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
              placeholder="Amount"
              value={editDraft.amount}
              onChange={(ev) => setEditDraft((d) => ({ ...d, amount: ev.target.value }))}
            />
            <input
              type="date"
              className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
              value={editDraft.date}
              onChange={(ev) => setEditDraft((d) => ({ ...d, date: ev.target.value }))}
            />
          </div>
          <select
            className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
            value={editDraft.category}
            onChange={(ev) => setEditDraft((d) => ({ ...d, category: ev.target.value }))}
          >
            <option value="">No category</option>
            <option value="Food">Food</option>
            <option value="Housing">Housing</option>
            <option value="Transport">Transport</option>
            <option value="Utilities">Utilities</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Shopping">Shopping</option>
            <option value="Other">Other</option>
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-def px-3 py-1.5 text-xs text-lo"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveEdit(e.id)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </li>
      )
    }

    return (
      <li key={e.id} className="relative border-2 border-def bg-deep p-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-hi">{e.description || 'Expense'}</span>
              {showCatBadge && (
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getCategoryBadge(e.category || 'Other')}`}>
                  {e.category || 'Other'}
                </span>
              )}
            </div>
            <div className="text-xs text-dim mt-0.5">
              {new Date(e.date || e.created_at).toLocaleDateString()}
              {e.is_fixed ? ' • Fixed' : ''}
              {e.is_split ? ' • Split' : ''}
              {e.period ? ` • ${e.period}` : ''}
              {e.payer_id
                ? e.payer_id === user.id ? ' • You paid' : ` • ${members[e.payer_id]?.name || 'Member'} paid`
                : null}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-medium text-hi">${(e.amount / 100).toFixed(2)}</div>
            {myShare ? (
              myShare.settled
                ? <div className="text-xs text-emerald-300">Settled</div>
                : <div className="text-xs text-amber-300">You owe ${(myShare.amount / 100).toFixed(2)}</div>
            ) : e.is_split && e.payer_id === user.id ? (
              <div className="text-xs text-dim">You paid</div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => openMenu(e)}
            className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-dim hover:bg-input hover:text-hi transition-colors ${isMenuOpen ? 'bg-input text-hi' : ''}`}
            aria-label="Options"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>
        </div>

        {isMenuOpen && (
          <div ref={menuRef} className="absolute right-0 top-full z-50 mt-1 w-64 border-2 border-def bg-card shadow-xl">
            {e.is_split && (
              <div className="border-b border-def p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Who's paid their share</p>
                {loadingMenuShares && !shares.length ? (
                  <p className="text-xs text-dim">Loading…</p>
                ) : shares.length === 0 ? (
                  <p className="text-xs text-dim">No shares recorded.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {shares.map((share) => (
                      <li key={share.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${share.settled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className="truncate text-sm text-lo">{share.name}</span>
                          <span className="shrink-0 text-xs text-dim">${(share.amount / 100).toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          disabled={togglingShare === share.id}
                          onClick={() => handleToggleShare(share.id, share.settled, e.id)}
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                            share.settled
                              ? 'bg-input text-lo hover:bg-amber-500/20 hover:text-amber-300'
                              : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40'
                          }`}
                        >
                          {togglingShare === share.id ? '…' : share.settled ? 'Mark unpaid' : 'Mark paid'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {myShare && (
              <div className="border-b border-def p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Your share</p>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${myShare.settled ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {myShare.settled ? 'Settled' : `You owe $${(myShare.amount / 100).toFixed(2)}`}
                  </span>
                  <button
                    type="button"
                    disabled={togglingShare === myShare.id}
                    onClick={() => handleToggleShare(myShare.id, myShare.settled, e.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      myShare.settled
                        ? 'bg-input text-lo hover:bg-amber-500/20 hover:text-amber-300'
                        : 'bg-emerald-600 text-hi hover:bg-emerald-500'
                    }`}
                  >
                    {togglingShare === myShare.id ? '…' : myShare.settled ? 'Mark unpaid' : 'Mark settled'}
                  </button>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="border-b border-def p-2">
                <button
                  type="button"
                  onClick={() => startEdit(e)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-hi hover:bg-input transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81 3.22 11.34a.25.25 0 0 0-.063.108l-.587 2.054 2.054-.587a.25.25 0 0 0 .108-.063z" />
                  </svg>
                  Edit entry
                </button>
              </div>
            )}

            {canDelete && (
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => handleDelete(e)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 2h4a1 1 0 0 1 1 1H5a1 1 0 0 1 1-1ZM3 4h10l-1 9H4L3 4Zm3 2v5h1V6H6Zm3 0v5h1V6H9Z" />
                  </svg>
                  Delete charge
                </button>
              </div>
            )}

            {!canEdit && !e.is_split && !myShare && !canDelete && (
              <div className="p-3">
                <p className="text-xs text-dim">No actions available.</p>
              </div>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <section>
      {/* Header: title + sort dropdown + month nav */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-xl font-semibold text-hi shrink-0">Ledger</h2>
        <div className="flex items-center gap-2">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            className="rounded-lg bg-input border-2 border-def px-2 py-1 font-pixel text-[10px] text-hi"
          >
            <option value="recent">Most Recent</option>
            <option value="category">By Category</option>
          </select>

          {selectedMonth && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-dim hover:bg-card hover:text-hi transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="font-pixel min-w-[100px] text-center text-[11px] font-medium text-lo">{formattedMonth}</span>
              <button
                type="button"
                onClick={nextMonth}
                disabled={isCurrentMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-dim hover:bg-card hover:text-hi transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fixed-bill progress bar */}
      {splitCount > 0 && (
        <div className="mt-4 border-2 border-def bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-pixel text-xs font-semibold text-hi">Fixed bills</p>
            <p className={`text-sm font-medium ${allPaid ? 'text-emerald-300' : 'text-lo'}`}>
              {paidCount} / {splitCount} paid
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-input">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                allPaid ? 'bg-emerald-500' : paidCount > 0 ? 'bg-amber-400' : 'bg-input'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {allPaid && <p className="mt-1.5 text-xs text-emerald-400">All fixed bills paid for {formattedMonth}</p>}
        </div>
      )}

      {/* Ledger list */}
      <div className="mt-4 border-2 border-def bg-card p-4 text-lo">
        {loading ? (
          <div className="text-dim">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="border-2 border-dashed border-def bg-deep p-6 text-center text-dim">
            <p className="font-medium text-lo">Nothing here yet.</p>
            <p className="mt-1 text-sm">No expenses recorded for {formattedMonth}.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-lo">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</div>
              <div className="font-medium text-hi">Total ${(overallTotal / 100).toFixed(2)}</div>
            </div>

            {sortMode === 'recent' ? (
              <ul className="space-y-1.5">
                {sortedExpenses.map((e) => renderEntry(e, true))}
              </ul>
            ) : (
              <div className="space-y-3">
                {sortedCategories.map(([category, entries]) => {
                  const isCollapsed = collapsed.has(category)
                  const catTotal = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
                  const sortedEntries = [...entries].sort(
                    (a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)
                  )

                  return (
                    <div key={category} className="border-2 border-def bg-deep">
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getCategoryBadge(category)}`}>
                            {category}
                          </span>
                          <span className="text-xs text-dim">{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-lo">${(catTotal / 100).toFixed(2)}</span>
                          <span className="text-faint">{isCollapsed ? <ChevronRight /> : <ChevronDown />}</span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <ul className="border-t border-def px-2 pb-2 pt-1 space-y-1.5">
                          {sortedEntries.map((e) => renderEntry(e, false))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
