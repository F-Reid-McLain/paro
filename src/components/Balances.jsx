import { useEffect, useState } from 'react'
import { fetchGroupBalances, fetchMyUnsettledShares, fetchSplitFixedExpenses, settleExpenseShare, settleUp, recordPayment, recordFixedExpensePayment } from '../lib/api'

export default function Balances({ supabase, user, currentGroup, members, onRefresh }) {
  const [balances, setBalances] = useState({})
  const [myShares, setMyShares] = useState([])
  const [splitFixed, setSplitFixed] = useState([])
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(null)
  const [settlingShare, setSettlingShare] = useState(null)
  // Payment recording: which userId we're recording a payment to/from, plus form state
  const [recordingPaymentFor, setRecordingPaymentFor] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
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

  async function handleRecordPayment(withUserId, netAmount) {
    const parsed = parseFloat(paymentAmount)
    if (Number.isNaN(parsed) || parsed <= 0) {
      alert('Enter a valid payment amount')
      return
    }
    setSavingPayment(true)
    try {
      // netAmount < 0 means I owe them → I'm the payer; netAmount > 0 means they owe me → they're the payer
      const amountCents = Math.round(parsed * 100)
      const payerId = netAmount < 0 ? user.id : withUserId
      const payeeId = netAmount < 0 ? withUserId : user.id
      await recordPayment(supabase, {
        groupId: currentGroup.id,
        payerId,
        payeeId,
        amount: amountCents,
        note: paymentNote.trim() || null,
      })
      setRecordingPaymentFor(null)
      setPaymentAmount('')
      setPaymentNote('')
      await load()
    } catch (e) {
      console.error('record payment', e)
      alert(e.message || 'Failed to record payment')
    } finally {
      setSavingPayment(false)
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

  const sharesByPayer = myShares.reduce((acc, item) => {
    const payerId = item.expense?.payer_id
    if (!payerId) return acc
    if (!acc[payerId]) acc[payerId] = []
    acc[payerId].push(item)
    return acc
  }, {})

  return (
    <section className="space-y-8">
      {/* Net balances */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Balances</h2>
          <span className="text-xs text-slate-400">{currentGroup?.name}</span>
        </div>
        <p className="mt-2 text-slate-300">Net amounts owed across all unsettled expenses.</p>

        <div className="mt-4">
          {!currentGroup ? (
            <p className="text-slate-400">Select a group to see balances.</p>
          ) : loading ? (
            <p className="text-slate-400">Loading…</p>
          ) : balanceEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-800/50 p-6 text-center">
              <p className="font-semibold text-slate-200">All settled up!</p>
              <p className="mt-1 text-sm text-slate-400">No outstanding balances in {currentGroup.name}.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {balanceEntries.map(([userId, netAmount]) => {
                const name = members[userId]?.name || 'Group member'
                const youOwe = netAmount < 0
                const absAmount = Math.abs(netAmount)
                const isRecording = recordingPaymentFor === userId
                return (
                  <li key={userId} className="rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{name}</p>
                        <p className={`mt-0.5 text-sm font-medium ${youOwe ? 'text-amber-300' : 'text-emerald-300'}`}>
                          {youOwe ? `You owe $${(absAmount / 100).toFixed(2)}` : `Owes you $${(absAmount / 100).toFixed(2)}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRecordingPaymentFor(isRecording ? null : userId)
                            setPaymentAmount('')
                            setPaymentNote('')
                          }}
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                        >
                          {isRecording ? 'Cancel' : 'Record payment'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettleUp(userId)}
                          disabled={settling === userId}
                          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {settling === userId ? 'Settling…' : 'Settle up'}
                        </button>
                      </div>
                    </div>

                    {isRecording && (
                      <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-2">
                        <p className="text-xs text-slate-400">
                          {youOwe ? `Record a payment you made to ${name}` : `Record a payment ${name} made to you`}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="Amount ($)"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-slate-100"
                          />
                          <input
                            type="text"
                            placeholder="Note (optional)"
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingPayment}
                          onClick={() => handleRecordPayment(userId, netAmount)}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {savingPayment ? 'Saving…' : 'Save payment'}
                        </button>
                      </div>
                    )}
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
          <h3 className="text-lg font-semibold text-white">Recurring splits</h3>
          <p className="mt-1 text-sm text-slate-300">Fixed expenses shared evenly among all group members.</p>
          <ul className="mt-4 space-y-2">
            {splitFixed.map((fe) => (
              <li key={fe.id} className="rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{fe.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {fe.period} • {fe.memberCount} members • total ${(fe.amount / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">${(fe.myShare / 100).toFixed(2)}</p>
                      <p className="text-xs text-slate-400">your share</p>
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
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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

      {/* Your unsettled shares */}
      {currentGroup && !loading && (
        <div>
          <h3 className="text-lg font-semibold text-white">Your unsettled shares</h3>
          <p className="mt-1 text-sm text-slate-300">Expenses you owe a portion of. Mark individual items settled as you pay them.</p>

          <div className="mt-4">
            {myShares.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-800/50 p-6 text-center">
                <p className="text-sm text-slate-400">You have no unsettled shares right now.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(sharesByPayer).map(([payerId, items]) => {
                  const payerName = members[payerId]?.name || 'Group member'
                  const subtotal = items.reduce((sum, i) => sum + i.shareAmount, 0)
                  return (
                    <div key={payerId} className="rounded-2xl border border-white/10 bg-slate-800/70 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Paid by {payerName}</p>
                        <p className="text-sm font-medium text-amber-300">You owe ${(subtotal / 100).toFixed(2)}</p>
                      </div>
                      <ul className="space-y-2">
                        {items.map(({ shareId, shareAmount, expense }) => (
                          <li key={shareId} className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-900/60 px-3 py-2.5">
                            <div>
                              <p className="text-sm text-white">{expense?.description || 'Expense'}</p>
                              <p className="text-xs text-slate-400">
                                {expense?.date ? new Date(expense.date).toLocaleDateString() : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-sm font-medium text-white">${(shareAmount / 100).toFixed(2)}</p>
                              <button
                                type="button"
                                onClick={() => handleSettleShare(shareId)}
                                disabled={settlingShare === shareId}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                              >
                                {settlingShare === shareId ? '…' : 'Settled'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
