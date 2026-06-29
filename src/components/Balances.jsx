import { useEffect, useState } from 'react'
import { fetchGroupBalances, settleUp } from '../lib/api'

export default function Balances({ supabase, user, currentGroup, members, onRefresh }) {
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(null)

  async function load() {
    if (!currentGroup?.id) return
    setLoading(true)
    try {
      const result = await fetchGroupBalances(supabase, { groupId: currentGroup.id, currentUserId: user.id })
      setBalances(result)
    } catch (e) {
      console.error('fetch balances', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentGroup?.id])

  async function handleSettle(withUserId) {
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

  const entries = Object.entries(balances).filter(([, amount]) => amount !== 0)

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Balances</h2>
        <span className="text-xs text-slate-400">{currentGroup?.name}</span>
      </div>
      <p className="mt-2 text-slate-300">Net amounts owed across all unsettled expenses in this group.</p>

      <div className="mt-6">
        {!currentGroup ? (
          <p className="text-slate-400">Select a group to see balances.</p>
        ) : loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-800/50 p-8 text-center">
            <p className="font-semibold text-slate-200">All settled up!</p>
            <p className="mt-1 text-sm text-slate-400">No outstanding balances in {currentGroup.name}.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map(([userId, netAmount]) => {
              const name = members[userId]?.name || 'Group member'
              const youOwe = netAmount < 0
              const absAmount = Math.abs(netAmount)

              return (
                <li key={userId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-4">
                  <div>
                    <p className="font-medium text-white">{name}</p>
                    <p className={`mt-0.5 text-sm font-medium ${youOwe ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {youOwe
                        ? `You owe $${(absAmount / 100).toFixed(2)}`
                        : `Owes you $${(absAmount / 100).toFixed(2)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSettle(userId)}
                    disabled={settling === userId}
                    className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {settling === userId ? 'Settling…' : 'Settle up'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
