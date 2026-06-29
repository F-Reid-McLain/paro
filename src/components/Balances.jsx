import { useEffect, useState } from 'react'
import { fetchGroupBalances, fetchMyUnsettledShares, fetchSplitFixedExpenses, settleExpenseShare, settleUp, recordFixedExpensePayment } from '../lib/api'

export default function Balances({ supabase, user, currentGroup, members, onRefresh }) {
  const [balances, setBalances] = useState({})
  const [myShares, setMyShares] = useState([])
  const [splitFixed, setSplitFixed] = useState([])
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(null)
  const [settlingShare, setSettlingShare] = useState(null)
  // Fixed expense period marking
  const [markingFixed, setMarkingFixed] = useState(new Set())

  async function load() {
    if (!currentGroup?.id) return
    setLoading(true)
    try {
      const [balanceResult, sharesResult, fixedResult] = await Promise.all([
        fetchGroupBalances(supabase, { groupId: currentGroup.id, currentUserId: user.id }),
        fetchMyUnsettledShares(supabase, { groupId: currentGroup.id, userId: user.id }),
        fetchSplitFixedExpenses(supabase, { groupId: currentGroup.id, userId: user.id }),
      ])
      setBalances(balanceResult)
      setMyShares(sharesResult)
      setSplitFixed(fixedResult)
    } catch (e) {
      console.error('fetch balances', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentGroup?.id])

  async function handleSettleUp(withUserId) {
    setSettling(withUserId)
    try {
      await settleUp(supabase, { groupId: currentGroup.id, withUserId, currentUserId: user.id })
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('settle up', e)
      alert(e.message || 'Failed to settle up')
    } finally {
      setSettling(null)
    }
  }

  async function handleSettleShare(shareId) {
    setSettlingShare(shareId)
    try {
      await settleExpenseShare(supabase, shareId)
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('settle share', e)
      alert(e.message || 'Failed to mark as settled')
    } finally {
      setSettlingShare(null)
    }
  }

  async function handleMarkFixedPaid(fe) {
    setMarkingFixed((prev) => new Set([...prev, fe.id]))
    try {
      await recordFixedExpensePayment(supabase, {
        fixedExpenseId: fe.id,
        userId: user.id,
        periodLabel: fe.currentPeriodLabel,
        amount: fe.myShare,
      })
      await load()
    } catch (e) {
      console.error('mark fixed paid', e)
      // unique constraint violation just means already paid
      if (e.code !== '23505' && !e.message?.includes('duplicate')) {
        alert(e.message || 'Failed to mark as paid')
      } else {
        await load()
      }
    } finally {
      setMarkingFixed((prev) => { const s = new Set(prev); s.delete(fe.id); return s })
    }
  }

  const balanceEntries = Object.entries(balances).filter(([, amount]) => amount !== 0)

  const selfShares = myShares.filter((s) => s.isSelfShare)

  return (
    <section className="space-y-8">
      {/* Net balances */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-xl font-semibold text-hi">Balances</h2>
          <span className="text-xs text-dim">{currentGroup?.name}</span>
        </div>
        <p className="mt-2 text-lo">Net amounts owed across all unsettled expenses.</p>

        <div className="mt-4">
          {!currentGroup ? (
            <p className="text-dim">Select a group to see balances.</p>
          ) : loading ? (
            <p className="text-dim">Loading…</p>
          ) : balanceEntries.length === 0 ? (
            <div className="border-2 border-dashed border-def bg-card p-6 text-center">
              <p className="font-semibold text-lo">All settled up!</p>
              <p className="mt-1 text-sm text-dim">No outstanding balances in {currentGroup.name}.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {balanceEntries.map(([userId, netAmount]) => {
                const name = members[userId]?.name || 'Group member'
                const youOwe = netAmount < 0
                const absAmount = Math.abs(netAmount)
                return (
                  <li key={userId} className="flex items-center justify-between border-2 border-def bg-card px-4 py-4">
                    <div>
                      <p className="font-medium text-hi">{name}</p>
                      <p className={`mt-0.5 text-sm font-medium ${youOwe ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {youOwe ? `You owe $${(absAmount / 100).toFixed(2)}` : `Owes you $${(absAmount / 100).toFixed(2)}`}
                      </p>
                      <p className="mt-1 text-xs text-faint">Mark individual expenses paid via the ledger ⋯ menu</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSettleUp(userId)}
                      disabled={settling === userId}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-hi disabled:opacity-60"
                    >
                      {settling === userId ? 'Settling…' : 'Settle all'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Recurring splits */}
      {currentGroup && !loading && splitFixed.length > 0 && (
        <div>
          <h3 className="font-pixel text-sm font-semibold text-hi">Recurring splits</h3>
          <p className="mt-1 text-sm text-lo">Fixed expenses shared evenly among all group members.</p>
          <ul className="mt-4 space-y-2">
            {splitFixed.map((fe) => (
              <li key={fe.id} className="border-2 border-def bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-hi">{fe.name}</p>
                    <p className="mt-0.5 text-xs text-dim">
                      {fe.period} • {fe.memberCount} members • total ${(fe.amount / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-hi">${(fe.myShare / 100).toFixed(2)}</p>
                      <p className="text-xs text-dim">your share</p>
                    </div>
                    {fe.paidThisPeriod ? (
                      <span className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300">
                        {fe.currentPeriodLabel} paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={markingFixed.has(fe.id)}
                        onClick={() => handleMarkFixedPaid(fe)}
                        className="rounded-lg bg-accent-dark px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                      >
                        {markingFixed.has(fe.id) ? '…' : `Mark ${fe.currentPeriodLabel} paid`}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Your own unpaid contributions */}
      {currentGroup && !loading && selfShares.length > 0 && (
        <div>
          <h3 className="font-pixel text-sm font-semibold text-hi">Your unpaid contributions</h3>
          <p className="mt-1 text-sm text-lo">Expenses you created and split, but haven't marked your own share as paid yet.</p>
          <ul className="mt-4 space-y-2">
            {selfShares.map(({ shareId, shareAmount, expense }) => (
              <li key={shareId} className="flex items-center justify-between border-2 border-def bg-card px-4 py-3">
                <div>
                  <p className="font-medium text-hi">{expense?.description || 'Expense'}</p>
                  <p className="mt-0.5 text-xs text-dim">
                    {expense?.date ? new Date(expense.date).toLocaleDateString() : ''} • your share
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-hi">${(shareAmount / 100).toFixed(2)}</p>
                  <button
                    type="button"
                    onClick={() => handleSettleShare(shareId)}
                    disabled={settlingShare === shareId}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                  >
                    {settlingShare === shareId ? '…' : 'Mark paid'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    </section>
  )
}
