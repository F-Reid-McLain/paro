import { useEffect, useRef, useState } from 'react'
import { fetchUserExpenseShares, fetchExpenseSharesWithMembers, setExpenseShareSettled } from '../lib/api'

export default function MonthlyLedger({ expenses = [], loading = false, supabase, user, onRefresh, onDelete, members = {} }) {
  const [userShares, setUserShares] = useState([])
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuSharesCache, setMenuSharesCache] = useState({})
  const [loadingMenuShares, setLoadingMenuShares] = useState(false)
  const [togglingShare, setTogglingShare] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    let mounted = true
    async function loadUserShares() {
      if (!supabase || !user?.id || !expenses.length) {
        if (mounted) setUserShares([])
        return
      }
      try {
        const expenseIds = expenses.map((expense) => expense.id)
        const { data, error } = await supabase
          .from('expense_shares')
          .select('*')
          .in('expense_id', expenseIds)
          .eq('user_id', user.id)
        if (mounted) setUserShares(error ? [] : data || [])
      } catch (e) {
        console.error('load user shares', e)
      }
    }
    loadUserShares()
    return () => { mounted = false }
  }, [supabase, user?.id, expenses])

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  async function openMenu(expense) {
    const id = expense.id
    if (openMenuId === id) { setOpenMenuId(null); return }
    setOpenMenuId(id)
    if (expense.is_split && !menuSharesCache[id]) {
      setLoadingMenuShares(true)
      try {
        const shares = await fetchExpenseSharesWithMembers(supabase, id)
        setMenuSharesCache((prev) => ({ ...prev, [id]: shares }))
      } catch (e) {
        console.error('load expense shares', e)
      } finally {
        setLoadingMenuShares(false)
      }
    }
  }

  async function handleToggleShare(shareId, currentSettled, expenseId) {
    setTogglingShare(shareId)
    try {
      await setExpenseShareSettled(supabase, shareId, !currentSettled)
      const shares = await fetchExpenseSharesWithMembers(supabase, expenseId)
      setMenuSharesCache((prev) => ({ ...prev, [expenseId]: shares }))
      onRefresh && onRefresh()
    } catch (e) {
      console.error('toggle share', e)
      alert(e.message || 'Failed to update')
    } finally {
      setTogglingShare(null)
    }
  }

  async function handleDelete(expense) {
    if (!window.confirm(`Remove "${expense.description || 'this expense'}"?`)) return
    setOpenMenuId(null)
    onDelete && onDelete(expense.id, expense.is_fixed)
  }

  const grouped = expenses.reduce((acc, entry) => {
    const kind = entry.is_fixed ? 'Fixed' : 'Variable'
    const category = entry.category || 'Other'
    if (!acc[kind]) acc[kind] = {}
    if (!acc[kind][category]) acc[kind][category] = []
    acc[kind][category].push(entry)
    return acc
  }, {})

  const overallTotal = expenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)

  function getCategoryBadge(category = 'Other') {
    const c = String(category).toLowerCase()
    if (c.includes('rent') || c.includes('home') || c.includes('housing')) return 'border-violet-400/30 bg-violet-500/15 text-violet-200'
    if (c.includes('food') || c.includes('grocer') || c.includes('dine')) return 'border-amber-400/30 bg-amber-500/15 text-amber-200'
    if (c.includes('transport') || c.includes('gas') || c.includes('travel')) return 'border-sky-400/30 bg-sky-500/15 text-sky-200'
    if (c.includes('bill') || c.includes('utility') || c.includes('internet')) return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    return 'border-slate-500/30 bg-slate-600/20 text-slate-200'
  }

  function getKindBadge(kind) {
    return kind === 'Fixed'
      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
      : 'border-sky-400/30 bg-sky-500/15 text-sky-200'
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Monthly Ledger</h2>
        <div className="text-sm text-slate-300">This month</div>
      </div>

      <p className="text-slate-300 mt-2">Track recurring bills and everyday spending in one monthly view.</p>

      <div className="mt-6 rounded border border-white/6 bg-slate-800 p-4 text-slate-200">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-6 text-center text-slate-400">
            <p className="font-medium text-slate-200">Nothing here yet.</p>
            <p className="mt-1 text-sm">Add your first expense using the + button to start building your monthly ledger.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-slate-300">{expenses.length} expenses</div>
              <div className="font-medium text-white">Total ${(overallTotal / 100).toFixed(2)}</div>
            </div>

            <div className="space-y-4">
              {Object.entries(grouped).map(([kind, categories]) => (
                <div key={kind} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{kind} Expenses</h3>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getKindBadge(kind)}`}>{kind}</span>
                    </div>
                    <div className="text-sm text-slate-300">
                      ${(Object.values(categories).reduce((sum, entries) => sum + entries.reduce((s, e) => s + (Number(e.amount) || 0), 0), 0) / 100).toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(categories).map(([category, entries]) => (
                      <div key={`${kind}-${category}`} className="rounded-xl border border-white/10 bg-slate-800/70 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getCategoryBadge(category)}`}>{category}</span>
                            <span className="text-xs text-slate-400">{entries.length} items</span>
                          </div>
                          <div className="text-sm text-slate-300">
                            ${(entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) / 100).toFixed(2)}
                          </div>
                        </div>

                        <ul className="space-y-2">
                          {entries.map((e) => {
                            const myShare = userShares.find((s) => s.expense_id === e.id)
                            const canDelete = e.is_fixed || e.payer_id === user.id
                            const isMenuOpen = openMenuId === e.id
                            const shares = menuSharesCache[e.id] || []

                            return (
                              <li key={e.id} className="relative rounded-xl border border-white/10 bg-slate-900/50 p-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-white">{e.description || 'Expense'}</div>
                                    <div className="text-xs text-slate-400">
                                      {new Date(e.date || e.created_at).toLocaleDateString()}
                                      {e.is_split ? ' • Split' : ''}
                                      {e.period ? ` • ${e.period}` : ''}
                                      {e.payer_id
                                        ? e.payer_id === user.id
                                          ? ' • You paid'
                                          : ` • ${members[e.payer_id]?.name || 'Member'} paid`
                                        : null}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="text-sm font-medium text-white">${(e.amount / 100).toFixed(2)}</div>
                                    {myShare ? (
                                      myShare.settled
                                        ? <div className="text-xs text-emerald-300">Settled</div>
                                        : <div className="text-xs text-amber-300">You owe ${(myShare.amount / 100).toFixed(2)}</div>
                                    ) : e.is_split && e.payer_id === user.id ? (
                                      <div className="text-xs text-slate-400">You paid</div>
                                    ) : null}
                                  </div>

                                  {/* 3-dot menu button */}
                                  <button
                                    type="button"
                                    onClick={() => openMenu(e)}
                                    className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors ${isMenuOpen ? 'bg-slate-700 text-white' : ''}`}
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
                                  <div
                                    ref={menuRef}
                                    className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-white/10 bg-slate-800 shadow-xl shadow-slate-950/60"
                                  >
                                    {/* Share statuses for split expenses */}
                                    {e.is_split && (
                                      <div className="border-b border-white/8 p-3">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Who's paid their share</p>
                                        {loadingMenuShares && !shares.length ? (
                                          <p className="text-xs text-slate-400">Loading…</p>
                                        ) : shares.length === 0 ? (
                                          <p className="text-xs text-slate-400">No shares recorded.</p>
                                        ) : (
                                          <ul className="space-y-1.5">
                                            {shares.map((share) => (
                                              <li key={share.id} className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className={`h-2 w-2 shrink-0 rounded-full ${share.settled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                                  <span className="truncate text-sm text-slate-200">{share.name}</span>
                                                  <span className="shrink-0 text-xs text-slate-400">${(share.amount / 100).toFixed(2)}</span>
                                                </div>
                                                <button
                                                  type="button"
                                                  disabled={togglingShare === share.id}
                                                  onClick={() => handleToggleShare(share.id, share.settled, e.id)}
                                                  className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                                    share.settled
                                                      ? 'bg-slate-700 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300'
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

                                    {/* My share toggle (if I'm a debtor) */}
                                    {myShare && (
                                      <div className="border-b border-white/8 p-3">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your share</p>
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
                                                ? 'bg-slate-700 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300'
                                                : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                            }`}
                                          >
                                            {togglingShare === myShare.id ? '…' : myShare.settled ? 'Mark unpaid' : 'Mark settled'}
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Delete */}
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
                                        <p className="text-xs text-slate-400">No actions available for this expense.</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
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
