import { useEffect, useState } from 'react'
import MonthlyLedger from './components/MonthlyLedger'
import Balances from './components/Balances'
import Settings from './components/Settings'
import AddExpenseModal from './components/AddExpenseModal'
import FloatingButton from './components/FloatingButton'
import { fetchExpenses, getUserGroups, getMemberProfiles, deleteExpense, deleteFixedExpense, fetchSplitFixedExpenses, updateExpense, updateFixedExpense } from './lib/api'

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  )
}

export default function Dashboard({ user, supabase }) {
  const [tab, setTab] = useState('monthly')
  const [openAdd, setOpenAdd] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentGroup, setCurrentGroup] = useState(null)
  const [members, setMembers] = useState({})
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [splitFixed, setSplitFixed] = useState([])
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [activityDraft, setActivityDraft] = useState({})
  const [savingActivity, setSavingActivity] = useState(false)

  const totalTracked = expenses.length + fixedExpenses.length
  const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) + fixedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const fixedCount = fixedExpenses.length
  const variableCount = expenses.length
  const recentActivity = [...expenses, ...fixedExpenses]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
    .slice(0, 4)

  async function loadDashboardData(groupId = currentGroup?.id, month = selectedMonth) {
    setLoading(true)
    try {
      if (!groupId) { setExpenses([]); setFixedExpenses([]); setSplitFixed([]); return }

      const y = month.getFullYear()
      const m = month.getMonth()
      const fromDate = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const toDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`
      const periodLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' })

      const [rows, fixedResult, splitFixedData] = await Promise.all([
        fetchExpenses(supabase, { group_id: groupId, fromDate, toDate }),
        supabase.from('fixed_expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
        fetchSplitFixedExpenses(supabase, { groupId, userId: user.id, periodLabel }),
      ])

      if (fixedResult.error) throw fixedResult.error

      const normalizedFixed = (fixedResult.data || []).map((item) => ({
        id: item.id, description: item.name, amount: item.amount,
        date: item.start_date || item.created_at,
        is_fixed: true, is_split: item.is_split || false, period: item.period,
        category: 'Fixed', created_at: item.created_at,
      }))

      setExpenses(rows)
      setFixedExpenses(normalizedFixed)
      setSplitFixed(splitFixedData)
    } catch (e) {
      console.error('fetch dashboard data', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id, isFixed) {
    try {
      if (isFixed) await deleteFixedExpense(supabase, id)
      else await deleteExpense(supabase, id)
      loadDashboardData(currentGroup?.id)
    } catch (e) {
      console.error('delete expense', e)
      alert(e.message || 'Failed to delete')
    }
  }

  function startActivityEdit(entry) {
    setActivityDraft({
      description: entry.description || '',
      amount: (Number(entry.amount) / 100).toFixed(2),
      date: entry.date ? entry.date.split('T')[0] : new Date().toISOString().split('T')[0],
      category: entry.category === 'Fixed' ? '' : (entry.category || ''),
    })
    setEditingActivityId(entry.id)
  }

  async function handleSaveActivityEdit(entry) {
    const parsed = parseFloat(activityDraft.amount)
    if (Number.isNaN(parsed) || parsed <= 0) { alert('Enter a valid amount'); return }
    setSavingActivity(true)
    try {
      if (entry.is_fixed) {
        await updateFixedExpense(supabase, entry.id, {
          name: activityDraft.description || entry.description,
          amount: Math.round(parsed * 100),
        })
      } else {
        await updateExpense(supabase, entry.id, {
          description: activityDraft.description || null,
          amount: Math.round(parsed * 100),
          date: activityDraft.date,
          category: activityDraft.category || null,
        })
      }
      setEditingActivityId(null)
      loadDashboardData(currentGroup?.id)
    } catch (e) {
      console.error('update activity entry', e)
      alert(e.message || 'Failed to save')
    } finally {
      setSavingActivity(false)
    }
  }

  function handleGroupChange(group) {
    setCurrentGroup(group)
    if (group?.id) {
      localStorage.setItem('paro-group-id', group.id)
      loadDashboardData(group.id)
      getMemberProfiles(supabase, group.id).then(setMembers).catch(console.error)
    } else {
      localStorage.removeItem('paro-group-id')
      setExpenses([])
      setFixedExpenses([])
      setSplitFixed([])
      setMembers({})
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const groups = await getUserGroups(supabase)
        if (!groups.length) return
        const storedId = localStorage.getItem('paro-group-id')
        const group = (storedId && groups.find((g) => g.id === storedId)) || groups[0]
        setCurrentGroup(group)
        localStorage.setItem('paro-group-id', group.id)
        loadDashboardData(group.id)
        getMemberProfiles(supabase, group.id).then(setMembers).catch(console.error)
      } catch (e) {
        console.error('init groups', e)
      }
    }
    init()
  }, [])

  const inSettings = tab === 'settings'

  return (
    <div className="min-h-screen bg-page text-hi">
      <header
        className="sticky top-0 z-40 border-b border-def bg-header backdrop-blur-md px-4 sm:px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between">
          {/* Left: back arrow (settings) or logo + group */}
          <div className="flex min-w-0 items-center gap-3">
            {inSettings ? (
              <button
                onClick={() => setTab('monthly')}
                className="flex items-center gap-1.5 text-sm text-dim hover:text-hi transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                </svg>
                Back
              </button>
            ) : (
              <>
                <h1 className="font-pixel shrink-0 text-lg font-semibold">Paro</h1>
                {currentGroup ? (
                  <span className="truncate bg-card px-2 py-1 text-xs text-lo max-w-[130px] sm:max-w-xs">
                    {currentGroup.name}
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* Right: desktop nav tabs + gear */}
          <div className="flex items-center gap-1">
            {!inSettings && (
              <nav className="hidden sm:flex items-center gap-1 mr-2">
                <button onClick={() => setTab('monthly')} className={`font-pixel rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'monthly' ? 'bg-accent text-hi' : 'text-lo hover:text-hi'}`}>Ledger</button>
                <button onClick={() => setTab('balances')} className={`font-pixel rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'balances' ? 'bg-accent text-hi' : 'text-lo hover:text-hi'}`}>Balances</button>
                <span className="ml-2 max-w-[180px] truncate text-xs text-dim">{user.email}</span>
              </nav>
            )}
            <button
              onClick={() => setTab(inSettings ? 'monthly' : 'settings')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${inSettings ? 'bg-accent text-hi' : 'text-dim hover:bg-card hover:text-hi'}`}
              aria-label="Settings"
            >
              <GearIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-10">
        {tab === 'monthly' ? (
          <div className="mb-6 space-y-4">
            <div className="border-2 border-def bg-card p-4 shadow-lg shadow-slate-950/30">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-pixel text-xs font-medium text-accent-muted">At a glance</p>
                  <h2 className="text-lg font-semibold text-hi">{currentGroup?.name || 'Choose a group to begin'}</h2>
                  <p className="text-sm text-dim">{totalTracked} entries tracked • {fixedCount} fixed • {variableCount} variable</p>
                </div>
                <div className="border-2 border-def bg-deep px-4 py-3 text-right">
                  <p className="font-pixel text-[9px] uppercase tracking-[0.15em] text-dim">Current total</p>
                  <p className="text-xl font-semibold text-hi">${(totalAmount / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="border-2 border-def bg-card p-4 shadow-lg shadow-slate-950/20">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-pixel text-xs font-semibold text-hi">Recent activity</h3>
                <span className="text-xs text-dim">Latest updates</span>
              </div>
              {recentActivity.length ? (
                <ul className="space-y-2">
                  {recentActivity.map((entry) => (
                    <li key={entry.id} className={`border-2 bg-deep ${editingActivityId === entry.id ? 'border-accent p-3 space-y-2' : 'border-def px-3 py-2'}`}>
                      {editingActivityId === entry.id ? (
                        <>
                          <input
                            className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                            placeholder="Description"
                            value={activityDraft.description}
                            onChange={(e) => setActivityDraft((d) => ({ ...d, description: e.target.value }))}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number" inputMode="decimal" step="0.01"
                              className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                              placeholder="Amount"
                              value={activityDraft.amount}
                              onChange={(e) => setActivityDraft((d) => ({ ...d, amount: e.target.value }))}
                            />
                            {!entry.is_fixed && (
                              <input
                                type="date"
                                className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                                value={activityDraft.date}
                                onChange={(e) => setActivityDraft((d) => ({ ...d, date: e.target.value }))}
                              />
                            )}
                          </div>
                          {!entry.is_fixed && (
                            <select
                              className="w-full rounded-none border-2 border-def bg-card px-3 py-1.5 text-sm text-hi"
                              value={activityDraft.category}
                              onChange={(e) => setActivityDraft((d) => ({ ...d, category: e.target.value }))}
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
                          )}
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingActivityId(null)} className="rounded-lg border border-def px-3 py-1.5 text-xs text-lo">Cancel</button>
                            <button type="button" disabled={savingActivity} onClick={() => handleSaveActivityEdit(entry)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-hi disabled:opacity-60">{savingActivity ? 'Saving…' : 'Save'}</button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-hi">{entry.description || 'Expense'}</p>
                            <p className="text-xs text-dim">{entry.is_fixed ? 'Fixed' : 'Variable'} • {entry.category || 'Other'}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-hi">${(Number(entry.amount) / 100).toFixed(2)}</p>
                              <p className="text-[11px] text-dim">{new Date(entry.date || entry.created_at).toLocaleDateString()}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => startActivityEdit(entry)}
                              className="shrink-0 rounded-lg border border-def px-2 py-1 text-xs text-lo hover:bg-input hover:text-hi transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-dim">No activity yet. Add your first expense using the + button.</p>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'settings' ? (
          <Settings supabase={supabase} user={user} currentGroup={currentGroup} onGroupChange={(g) => {
            handleGroupChange(g)
            setTab('monthly')
          }} />
        ) : tab === 'balances' ? (
          <Balances supabase={supabase} user={user} currentGroup={currentGroup} members={members} onRefresh={() => loadDashboardData(currentGroup?.id)} />
        ) : (
          <MonthlyLedger
            supabase={supabase} user={user} expenses={[...expenses, ...fixedExpenses]}
            loading={loading} members={members}
            onRefresh={() => loadDashboardData(currentGroup?.id)}
            onDelete={handleDelete}
            splitFixed={splitFixed}
            selectedMonth={selectedMonth}
            onMonthChange={(month) => { setSelectedMonth(month); loadDashboardData(currentGroup?.id, month) }}
          />
        )}
      </main>

      {/* Bottom tab bar — mobile only, 2 tabs */}
      {!inSettings && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-def bg-nav backdrop-blur-md sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button onClick={() => setTab('monthly')} className={`font-pixel flex-1 py-3 text-xs font-medium border-t-2 transition-colors ${tab === 'monthly' ? 'border-accent text-accent' : 'border-transparent text-faint'}`}>Ledger</button>
          <button onClick={() => setTab('balances')} className={`font-pixel flex-1 py-3 text-xs font-medium border-t-2 transition-colors ${tab === 'balances' ? 'border-accent text-accent' : 'border-transparent text-faint'}`}>Balances</button>
        </nav>
      )}

      <AddExpenseModal open={openAdd} onClose={() => setOpenAdd(false)} supabase={supabase} user={user} currentGroup={currentGroup} onCreated={() => loadDashboardData(currentGroup?.id)} />
      {!openAdd && <FloatingButton onClick={() => setOpenAdd(true)} />}
    </div>
  )
}
