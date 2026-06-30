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

function VenmoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.025 3C20.025 4.625 20.5 6.3 20.5 8.4c0 5.8-4.95 13.325-8.975 18.6H3L0 3.575l7.825-.75 1.575 12.675C11.025 12.975 13.55 8.525 13.55 5.8c0-1.475-.25-2.475-.65-3.3L19.025 3z"/>
    </svg>
  )
}

// Inline two-option panel shown wherever "Mark paid" is tapped
function PayChoice({ label, venmoUrl, onMarkPaid, onCancel, loading }) {
  return (
    <div className="border-t border-def bg-deep px-4 py-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-dim">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={venmoUrl || 'https://venmo.com'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onMarkPaid}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#008cff] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0079e0] transition-colors"
        >
          <VenmoIcon />
          Pay via Venmo
        </a>
        <button
          type="button"
          onClick={onMarkPaid}
          disabled={loading}
          className="rounded-lg border-2 border-def px-3 py-2.5 text-sm font-medium text-hi hover:bg-input transition-colors disabled:opacity-60"
        >
          {loading ? '…' : 'Mark as paid'}
        </button>
      </div>
      <button type="button" onClick={onCancel} className="text-xs text-dim hover:text-lo transition-colors">
        Cancel
      </button>
    </div>
  )
}

export default function Balances({ supabase, user, currentGroup, members, onRefresh }) {
  const [balances, setBalances] = useState({})
  const [myShares, setMyShares] = useState([])
  const [splitFixed, setSplitFixed] = useState([])
  const [loading, setLoading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [payChoiceFor, setPayChoiceFor] = useState(null)   // userId — for settle all
  const [shareChoiceFor, setShareChoiceFor] = useState(null) // shareId — for my shares
  const [recordingFor, setRecordingFor] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [acting, setActing] = useState(null) // generic in-progress id
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

  function closeAll() {
    setOpenMenuId(null)
    setPayChoiceFor(null)
    setShareChoiceFor(null)
    setRecordingFor(null)
  }

  // ── Settle all ──────────────────────────────────────────────
  async function doSettleAll(userId) {
    setPayChoiceFor(null)
    setActing(userId)
    try {
      await settleUp(supabase, { groupId: currentGroup.id, withUserId: userId, currentUserId: user.id })
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      toast(e.message || 'Failed to settle up')
    } finally {
      setActing(null)
    }
  }

  async function handleUnsettleAll(withUserId) {
    setOpenMenuId(null)
    const name = members[withUserId]?.name || 'this person'
    if (!window.confirm(`Undo all settled expenses with ${name}? They will show as unpaid again.`)) return
    setActing(withUserId)
    try {
      await unsettleUp(supabase, { groupId: currentGroup.id, withUserId, currentUserId: user.id })
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      toast(e.message || 'Failed to undo settlements')
    } finally {
      setActing(null)
    }
  }

  // ── Record payment form ──────────────────────────────────────
  function startRecordPayment(userId, netAmount) {
    setOpenMenuId(null)
    setPayChoiceFor(null)
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
      toast(e.message || 'Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  // ── My shares ────────────────────────────────────────────────
  async function doMarkShare(shareId, settled) {
    setShareChoiceFor(null)
    setActing(shareId)
    try {
      await setExpenseShareSettled(supabase, shareId, settled)
      await load()
      onRefresh && onRefresh()
    } catch (e) {
      toast(e.message || 'Failed to update')
    } finally {
      setActing(null)
    }
  }

  async function handleMarkFixedPaid(fe) {
    setActing(fe.id)
    try {
      await recordFixedExpensePayment(supabase, {
        fixedExpenseId: fe.id,
        userId: user.id,
        periodLabel: fe.currentPeriodLabel,
        amount: fe.myShare,
      })
      await load()
    } catch (e) {
      if (e.code !== '23505' && !e.message?.includes('duplicate')) {
        toast(e.message || 'Failed to mark as paid')
      } else {
        await load()
      }
    } finally {
      setActing(null)
    }
  }

  const balanceEntries = Object.entries(balances).filter(([, amount]) => amount !== 0)
  const owedShares = myShares.filter((s) => !s.isSelfShare)

  return (
    <section className="space-y-8">

      {/* ── Net balances ── */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-xl font-semibold text-hi">Balances</h2>
          <span className="text-xs text-dim">{currentGroup?.name}</span>
        </div>
        <p className="mt-1 text-sm text-lo">Net amounts owed between you and each person.</p>

        <div className="mt-4 space-y-3">
          {!currentGroup ? (
            <p className="text-dim">Select a group to see balances.</p>
          ) : loading ? (
            <p className="text-dim">Loading…</p>
          ) : balanceEntries.length === 0 && splitFixed.length === 0 ? (
            <div className="border-2 border-dashed border-def bg-card p-6 text-center">
              <p className="font-semibold text-lo">All settled up!</p>
              <p className="mt-1 text-sm text-dim">No outstanding balances in {currentGroup.name}.</p>
            </div>
          ) : (
            <>
              {balanceEntries.map(([userId, netAmount]) => {
                const member = members[userId]
                const name = member?.name || 'Group member'
                const youOwe = netAmount < 0
                const absAmount = Math.abs(netAmount)
                const isMenuOpen = openMenuId === userId
                const isChoosingPay = payChoiceFor === userId
                const isRecording = recordingFor === userId
                const venmoUrl = youOwe && member?.venmoHandle
                  ? `https://venmo.com/${member.venmoHandle}?txn=pay&amount=${(absAmount / 100).toFixed(2)}&note=Paro`
                  : null
                const venmoPayUrl = youOwe && member?.venmoHandle && paymentAmount
                  ? `https://venmo.com/${member.venmoHandle}?txn=pay&amount=${parseFloat(paymentAmount) || 0}&note=${encodeURIComponent(paymentNote || 'Paro')}`
                  : null

                return (
                  <div key={userId} className="border-2 border-def bg-card">
                    {/* Row */}
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
                          onClick={() => {
                            setOpenMenuId((prev) => (prev === userId ? null : userId))
                            setPayChoiceFor(null)
                            setRecordingFor(null)
                          }}
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
                                onClick={() => { setOpenMenuId(null); setPayChoiceFor(userId); setRecordingFor(null) }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-hi hover:bg-input transition-colors"
                              >
                                Settle all
                              </button>
                              <div className="my-1 border-t border-def" />
                              <button
                                type="button"
                                onClick={() => handleUnsettleAll(userId)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-warning hover:bg-amber-500/10 transition-colors"
                              >
                                Undo settlements
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Settle all → pay choice */}
                    {isChoosingPay && (
                      <PayChoice
                        label={`Settle up with ${name}`}
                        venmoUrl={venmoUrl}
                        loading={acting === userId}
                        onMarkPaid={() => doSettleAll(userId)}
                        onCancel={() => setPayChoiceFor(null)}
                      />
                    )}

                    {/* Record payment form */}
                    {isRecording && (
                      <div className="border-t border-def bg-deep px-4 py-3 space-y-3">
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
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setRecordingFor(null)} className="rounded-lg border border-def px-3 py-1.5 text-xs text-lo">
                            Cancel
                          </button>
                          {venmoPayUrl && (
                            <a
                              href={venmoPayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleRecordPayment(userId, youOwe)}
                              className="flex items-center gap-1.5 rounded-lg bg-[#008cff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0079e0] transition-colors"
                            >
                              <VenmoIcon />
                              Pay via Venmo
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={savingPayment}
                            onClick={() => handleRecordPayment(userId, youOwe)}
                            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                          >
                            {savingPayment ? 'Saving…' : 'Mark as paid'}
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
                    <p className="mt-0.5 text-xs text-dim">Recurring • {fe.period} • your share ${(fe.myShare / 100).toFixed(2)}</p>
                  </div>
                  {fe.paidThisPeriod ? (
                    <span className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-success">
                      {fe.currentPeriodLabel} paid
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={acting === fe.id}
                      onClick={() => handleMarkFixedPaid(fe)}
                      className="rounded-lg bg-accent-dark px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60"
                    >
                      {acting === fe.id ? '…' : `Mark ${fe.currentPeriodLabel} paid`}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── My shares ── */}
      {currentGroup && !loading && owedShares.length > 0 && (
        <div>
          <h3 className="font-pixel text-sm font-semibold text-hi">My shares</h3>
          <p className="mt-1 text-sm text-lo">Expenses paid by others that include your share.</p>
          <ul className="mt-4 space-y-2">
            {owedShares.map(({ shareId, shareAmount, expense, settled }) => {
              const payerId = expense?.payer_id
              const payerName = members[payerId]?.name || 'them'
              const payerVenmo = members[payerId]?.venmoHandle
              const venmoShareUrl = payerVenmo
                ? `https://venmo.com/${payerVenmo}?txn=pay&amount=${(shareAmount / 100).toFixed(2)}&note=${encodeURIComponent(expense?.description || 'Paro')}`
                : null

              return (
                <li key={shareId} className="border-2 border-def bg-card">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-hi">{expense?.description || 'Expense'}</p>
                      <p className="mt-0.5 text-xs text-dim">
                        {expense?.date ? new Date(expense.date).toLocaleDateString() : ''} • paid by {payerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold text-hi">${(shareAmount / 100).toFixed(2)}</p>
                      {settled && (
                        <span className="rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-2 py-1 text-xs font-medium text-success">Paid</span>
                      )}
                      {settled ? (
                        <button
                          type="button"
                          onClick={() => doMarkShare(shareId, false)}
                          disabled={acting === shareId}
                          className="rounded-lg border border-def px-3 py-1.5 text-xs font-medium text-warning hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                        >
                          {acting === shareId ? '…' : 'Undo'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShareChoiceFor((prev) => (prev === shareId ? null : shareId))}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-hi hover:bg-emerald-500 transition-colors"
                        >
                          Mark paid
                        </button>
                      )}
                    </div>
                  </div>

                  {shareChoiceFor === shareId && (
                    <PayChoice
                      label={`Pay ${payerName} for ${expense?.description || 'this expense'}`}
                      venmoUrl={venmoShareUrl}
                      loading={acting === shareId}
                      onMarkPaid={() => doMarkShare(shareId, true)}
                      onCancel={() => setShareChoiceFor(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

    </section>
  )
}
