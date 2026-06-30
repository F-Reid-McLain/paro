import { useEffect, useRef, useState } from 'react'
import { fetchGroupBalances, fetchMyShares, fetchSplitFixedExpenses, setExpenseShareSettled, settleUp, unsettleUp, recordPayment, recordFixedExpensePayment } from '../lib/api'
import { toast } from '../lib/toast'

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  )
}

export default function Balances({ supabase, user, currentGroup, members, onRefresh }) {
  const [balances, setBalances] = useState({})
  const [myShares, setMyShares] = useState([])
  const [splitFixed, setSplitFixed] = useState([])
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(null)
  const [unsettling, setUnsettling] = useState(null)
  const [togglingShare, setTogglingShare] = useState(null)
  const [markingFixed, setMarkingFixed] = useState(new Set())
  const [openMenuId, setOpenMenuId] = useState(null)
  const [recordingFor, setRecordingFor] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const menuRef = useRef(null)

  async function load() {
    if (!currentGroup?.id) return
    setLoading(true)
    try {
      const [balanceResult, sharesResult, fixedResult] = await Promise.all([
        fetchGroupBalances(supabase, { groupId: currentGroup.id, currentUserId: user.id }),
        fetchMyShares(supabase, { groupId: currentGroup.id, userId: user.id }),
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

  useEffect(() => {
    if (!openMenuId) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  function toggleMenu(id) {
    setOpenMenuId((prev) => (prev === id ? null : id))
    setRecordingFor(null)
  }

  function startRecordPayment(userId, netAmount) {
    setOpenMenuId(null)
    setRecordingFor(userId)
    setPaymentAmount((Math.abs(netAmount) / 100).toFixed(2))
    setPaymentNote('')
  }

  async function handleRecordPayment(withUserId, youOwe) {
    const parsed = parseFloat(paymentAmount)
    if (Number.isNaN(parsed) || parsed <= 0) { toast('Enter a valid amount'); return }
    setSavingPayment(true)
    try {
      await recordPayment(supabase, {
        groupId: currentGroup.id,
        payerId: youOwe ? user.id : withUserId,
        payeeId: youOwe ? withUserId : user.id,
        amount: Math.round(parsed * 100),
        note: paymentNote || null,
      })
      await settleUp(supabase, { groupId: currentGroup.id, withUserId, currentUserId: user.id })
      setRecordingFor(null)
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('record payment', e)
      toast(e.message || 'Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  async function handleSettleAll(withUserId) {
    setOpenMenuId(null)
    const name = members[withUserId]?.name || 'this person'
    if (!window.confirm(`Mark all expenses with ${name} as settled? This cannot be undone.`)) return
    setSettling(withUserId)
    try {
      await settleUp(supabase, { groupId: currentGroup.id, withUserId, currentUserId: user.id })
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('settle up', e)
      toast(e.message || 'Failed to settle up')
    } finally {
      setSettling(null)
    }
  }

  async function handleUnsettleAll(withUserId) {
    setOpenMenuId(null)
    const name = members[withUserId]?.name || 'this person'
    if (!window.confirm(`Undo all settled expenses with ${name}? They will show as unpaid again.`)) return
    setUnsettling(withUserId)
    try {
      await unsettleUp(supabase, { groupId: currentGroup.id, withUserId, currentUserId: user.id })
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('unsettle up', e)
      toast(e.message || 'Failed to undo settlements')
    } finally {
      setUnsettling(null)
    }
  }

  async function handleToggleShare(shareId, currentSettled) {
    setTogglingShare(shareId)
    try {
      await setExpenseShareSettled(supabase, shareId, !currentSettled)
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      console.error('toggle share', e)
      toast(e.message || 'Failed to update')
    } finally {
      setTogglingShare(null)
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
      if (e.code !== '23505' && !e.message?.includes('duplicate')) {
        toast(e.message || 'Failed to mark as paid')
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

        <div className="mt-4 space-y-3">
          {!currentGroup ? (
            <p className="text-dim">Select a group to see balances.</p>
          ) : loading ? (
            <p className="text-dim">Loading…</p>
          ) : (
            <>
              {balanceEntries.length === 0 && splitFixed.length === 0 ? (
                <div className="border-2 border-dashed border-def bg-card p-6 text-center">
                  <p className="font-semibold text-lo">All settled up!</p>
                  <p className="mt-1 text-sm text-dim">No outstanding balances in {currentGroup.name}.</p>
                </div>
              ) : (
                <>
                  {balanceEntries.map(([userId, netAmount]) => {
                    const name = members[userId]?.name || 'Group member'
                    const youOwe = netAmount < 0
                    const absAmount = Math.abs(netAmount)
                    const isMenuOpen = openMenuId === userId
                    const isRecording = recordingFor === userId

                    return (
                      <div key={userId} className="border-2 border-def bg-card">
                        <div className="flex items-center justify-between px-4 py-4">
                          <div>
                            <p className="font-medium text-hi">{name}</p>
                            <p className={`mt-0.5 text-sm font-medium ${youOwe ? 'text-warning' : 'text-success'}`}>
                              {youOwe ? `You owe $${(absAmount / 100).toFixed(2)}` : `Owes you $${(absAmount / 100).toFixed(2)}`}
                            </p>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => toggleMenu(userId)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-dim hover:bg-input hover:text-hi transition-colors ${isMenuOpen ? 'bg-input text-hi' : ''}`}
                              aria-label="Options"
                            >
                              <DotsIcon />
                            </button>
                            {isMenuOpen && (
                              <div ref={menuRef} className="absolute right-0 top-full z-50 mt-1 w-52 border-2 border-def bg-card shadow-xl">
                                <div className="p-1.5 space-y-0.5">
                                  <button
                                    type="button"
                                    onClick={() => startRecordPayment(userId, netAmount)}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-hi hover:bg-input transition-colors"
                                  >
                                    Record payment…
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSettleAll(userId)}
                                    disabled={settling === userId}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-hi hover:bg-input transition-colors disabled:opacity-60"
                                  >
                                    {settling === userId ? 'Settling…' : 'Settle all'}
                                  </button>
                                  <div className="my-1 border-t border-def" />
                                  <button
                                    type="button"
                                    onClick={() => handleUnsettleAll(userId)}
                                    disabled={unsettling === userId}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-warning hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                                  >
                                    {unsettling === userId ? 'Undoing…' : 'Undo settlements'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline payment form */}
                        {isRecording && (
                          <div className="border-t border-def bg-deep px-4 py-3 space-y-2">
                            <p className="text-xs font-semibold text-dim uppercase tracking-wider">
                              Record payment {youOwe ? `to ${name}` : `from ${name}`}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim pointer-events-none">$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  className="w-full rounded-none border-2 border-def bg-card pl-6 pr-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                />
                              </div>
                              <input
                                type="text"
                                placeholder="Note (optional)"
                                className="rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi placeholder:text-dim focus:border-accent focus:outline-none"
                                value={paymentNote}
                                onChange={(e) => setPaymentNote(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setRecordingFor(null)}
                                className="rounded-lg border border-def px-3 py-1.5 text-xs text-lo"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingPayment}
                                onClick={() => handleRecordPayment(userId, youOwe)}
                                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                              >
                                {savingPayment ? 'Saving…' : 'Confirm payment'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {splitFixed.map((fe) => (
                    <div key={fe.id} className="flex items-center justify-between border-2 border-def bg-card px-4 py-3">
                      <div>
                        <p className="font-medium text-hi">{fe.name}</p>
                        <p className="mt-0.5 text-xs text-dim">
                          Recurring • {fe.period} • your share ${(fe.myShare / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {fe.paidThisPeriod ? (
                          <span className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-success">
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
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Your split contributions — all (paid and unpaid) */}
      {currentGroup && !loading && selfShares.length > 0 && (
        <div>
          <h3 className="font-pixel text-sm font-semibold text-hi">Your contributions</h3>
          <p className="mt-1 text-sm text-lo">Expenses you created and split. Mark yours paid or undo if needed.</p>
          <ul className="mt-4 space-y-2">
            {selfShares.map(({ shareId, shareAmount, expense, settled }) => (
              <li key={shareId} className="flex items-center justify-between border-2 border-def bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-hi">{expense?.description || 'Expense'}</p>
                  <p className="mt-0.5 text-xs text-dim">
                    {expense?.date ? new Date(expense.date).toLocaleDateString() : ''} • your share
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-sm font-semibold text-hi">${(shareAmount / 100).toFixed(2)}</p>
                  {settled ? (
                    <span className="rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-2 py-1 text-xs font-medium text-success">
                      Paid
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleToggleShare(shareId, settled)}
                    disabled={togglingShare === shareId}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      settled
                        ? 'border border-def text-warning hover:bg-amber-500/10'
                        : 'bg-emerald-600 text-hi hover:bg-emerald-500'
                    }`}
                  >
                    {togglingShare === shareId ? '…' : settled ? 'Undo' : 'Mark paid'}
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
