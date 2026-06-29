import { useEffect, useState } from 'react'
import { fetchUserExpenseShares, settleExpenseShare } from '../lib/api'

export default function MonthlyLedger({ expenses = [], loading = false, supabase, user, onRefresh }) {
  const [userShares, setUserShares] = useState([])
  const [settlingShareId, setSettlingShareId] = useState(null)

  useEffect(() => {
    let mounted = true
    async function loadUserShares() {
      if (!supabase || !user?.id || !expenses.length) {
        if (mounted) setUserShares([])
        return
      }

      try {
        const expenseIds = expenses.map((expense) => expense.id)
        const shares = await fetchUserExpenseShares(supabase, expenseIds, user.id)
        if (mounted) setUserShares(shares)
      } catch (e) {
        console.error('load user shares', e)
      }
    }

    loadUserShares()
    return () => {
      mounted = false
    }
  }, [supabase, user?.id, expenses])

  async function handleSettle(shareId) {
    setSettlingShareId(shareId)
    try {
      await settleExpenseShare(supabase, shareId)
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('settle share', e)
      alert(e.message || 'Failed to mark payment as settled')
    } finally {
      setSettlingShareId(null)
    }
  }

  const grouped = expenses.reduce((acc, entry) => {
    const kind = entry.is_fixed ? 'Fixed' : 'Variable'
    const category = entry.category || 'Other'
    if (!acc[kind]) acc[kind] = {}
    if (!acc[kind][category]) acc[kind][category] = []
    acc[kind][category].push(entry)
    return acc
  }, {})

  const totals = Object.fromEntries(
    Object.entries(grouped).map(([kind, categories]) => [
      kind,
      Object.fromEntries(
        Object.entries(categories).map(([category, entries]) => [
          category,
          entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
        ])
      ),
    ])
  )

  const overallTotal = expenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)

  function getCategoryBadge(category = 'Other') {
    const normalized = String(category).toLowerCase()
    if (normalized.includes('rent') || normalized.includes('home') || normalized.includes('housing')) {
      return 'border-violet-400/30 bg-violet-500/15 text-violet-200'
    }
    if (normalized.includes('food') || normalized.includes('grocer') || normalized.includes('dine')) {
      return 'border-amber-400/30 bg-amber-500/15 text-amber-200'
    }
    if (normalized.includes('transport') || normalized.includes('gas') || normalized.includes('travel')) {
      return 'border-sky-400/30 bg-sky-500/15 text-sky-200'
    }
    if (normalized.includes('bill') || normalized.includes('utility') || normalized.includes('internet')) {
      return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    }
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
              <div className="font-medium text-white">Total ${((overallTotal)/100).toFixed(2)}</div>
            </div>

            <div className="space-y-4">
              {Object.entries(grouped).map(([kind, categories]) => (
                <div key={kind} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{kind} Expenses</h3>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getKindBadge(kind)}`}>{kind}</span>
                    </div>
                    <div className="text-sm text-slate-300">${((Object.values(categories).reduce((sum, entries) => sum + entries.reduce((entrySum, entry) => entrySum + (Number(entry.amount) || 0), 0), 0))/100).toFixed(2)}</div>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(categories).map(([category, entries]) => (
                      <div key={`${kind}-${category}`} className="rounded-xl border border-white/10 bg-slate-800/70 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getCategoryBadge(category)}`}>{category}</span>
                            <span className="text-xs text-slate-400">{entries.length} items</span>
                          </div>
                          <div className="text-sm text-slate-300">${((entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0))/100).toFixed(2)}</div>
                        </div>
                        <ul className="space-y-2">
                          {entries.map((e) => {
                            const share = userShares.find((entry) => entry.expense_id === e.id)

                            return (
                              <li key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 p-2.5">
                                <div>
                                  <div className="text-sm font-medium text-white">{e.description || 'Expense'}</div>
                                  <div className="text-xs text-slate-400">
                                    {new Date(e.date || e.created_at).toLocaleDateString()}
                                    {e.is_split ? ' • Split cost' : ''}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-white">${(e.amount / 100).toFixed(2)}</div>
                                  {share ? (
                                    share.settled ? (
                                      <div className="text-xs text-emerald-300">Settled</div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleSettle(share.id)}
                                        disabled={settlingShareId === share.id}
                                        className="mt-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
                                      >
                                        {settlingShareId === share.id ? 'Updating…' : 'Mark settled'}
                                      </button>
                                    )
                                  ) : e.is_split ? (
                                    <div className="text-xs text-amber-300">Pending split</div>
                                  ) : null}
                                </div>
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
