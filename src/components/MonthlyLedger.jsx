import { useEffect, useRef, useState } from 'react'
import { fetchExpenseSharesWithMembers, setExpenseShareSettled } from '../lib/api'

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

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  // Collapse all categories when expenses change (new month / new data)
  useEffect(() => {
    const keys = new Set()
    expenses.forEach((e) => {
      const kind = e.is_fixed ? 'Fixed' : 'Variable'
      keys.add(`${kind}-${e.category || 'Other'}`)
    })
    setCollapsed(keys)
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

  const grouped = expenses.reduce((acc, entry) => {
    const kind = entry.is_fixed ? 'Fixed' : 'Variable'
    const category = entry.category || 'Other'
    if (!acc[kind]) acc[kind] = {}
    if (!acc[kind][category]) acc[kind][category] = []
    acc[kind][category].push(entry)
    return acc
  }, {})

  const overallTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  function getCategoryBadge(category = 'Other') {
    const c = String(category).toLowerCase()
    if (c.includes('rent') || c.includes('home') || c.includes('housing')) return 'border-violet-400/30 bg-violet-500/15 text-violet-200'
    if (c.includes('food') || c.includes('grocer') || c.includes('dine')) return 'border-amber-400/30 bg-amber-500/15 text-amber-200'
    if (c.includes('transport') || c.includes('gas') || c.includes('travel')) return 'border-sky-400/30 bg-sky-500/15 text-sky-200'
    if (c.includes('bill') || c.includes('utility') || c.includes('internet')) return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    return 'border-slate-500/30 bg-slate-600/20 text-lo'
  }

  function getKindBadge(kind) {
    return kind === 'Fixed'
      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
      : 'border-sky-400/30 bg-sky-500/15 text-sky-200'
  }

  return (
    <section>
      {/* Header + month selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xl font-semibold text-hi">Ledger</h2>
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
            <span className="font-pixel min-w-[110px] text-center text-[11px] font-medium text-lo">{formattedMonth}</span>
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
                allPaid ? 'bg-emerald-500' : paidCount > 0 ? 'bg-amber-400' : 'bg-slate-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {allPaid && (
            <p className="mt-1.5 text-xs text-emerald-400">All fixed bills paid for {formattedMonth}</p>
          )}
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
              <div className="text-sm text-lo">{expenses.length} expenses</div>
              <div className="font-medium text-hi">Total ${(overallTotal / 100).toFixed(2)}</div>
            </div>

            <div className="space-y-3">
              {Object.entries(grouped).map(([kind, categories]) => (
                <div key={kind} className="border-2 border-def bg-deep p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-pixel text-xs font-semibold text-hi">{kind}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getKindBadge(kind)}`}>{kind}</span>
                    </div>
                    <div className="text-sm text-lo">
                      ${(Object.values(categories).reduce((s, es) => s + es.reduce((a, e) => a + (Number(e.amount) || 0), 0), 0) / 100).toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {Object.entries(categories).map(([category, entries]) => {
                      const key = `${kind}-${category}`
                      const isCollapsed = collapsed.has(key)
                      const catTotal = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

                      return (
                        <div key={key} className="border-2 border-def bg-card">
                          {/* Category row — always visible, tap to expand */}
                          <button
                            type="button"
                            onClick={() => toggleCategory(key)}
                            className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getCategoryBadge(category)}`}>{category}</span>
                              <span className="text-xs text-dim">{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-lo">${(catTotal / 100).toFixed(2)}</span>
                              <span className="text-faint">{isCollapsed ? <ChevronRight /> : <ChevronDown />}</span>
                            </div>
                          </button>

                          {/* Items — hidden when collapsed */}
                          {!isCollapsed && (
                            <ul className="border-t border-def px-2 pb-2 pt-1 space-y-1.5">
                              {entries.map((e) => {
                                const myShare = userShares.find((s) => s.expense_id === e.id)
                                const canDelete = e.is_fixed || e.payer_id === user.id
                                const isMenuOpen = openMenuId === e.id
                                const shares = menuSharesCache[e.id] || []

                                return (
                                  <li key={e.id} className="relative border-2 border-def bg-deep p-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-hi">{e.description || 'Expense'}</div>
                                        <div className="text-xs text-dim">
                                          {new Date(e.date || e.created_at).toLocaleDateString()}
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

                                      {/* 3-dot menu button */}
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

                                    {/* Dropdown menu */}
                                    {isMenuOpen && (
                                      <div ref={menuRef} className="absolute right-0 top-full z-50 mt-1 w-64 border-2 border-def bg-card shadow-xl shadow-slate-950/60">
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

                                        {!e.is_split && !myShare && !canDelete && (
                                          <div className="p-3">
                                            <p className="text-xs text-dim">No actions available.</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
