import { useEffect, useState } from 'react'
import MonthlyLedger from './components/MonthlyLedger'
import Balances from './components/Balances'
import Settings from './components/Settings'
import AddExpenseModal from './components/AddExpenseModal'
import FloatingButton from './components/FloatingButton'
import { fetchExpenses, getUserGroups, getMemberProfiles, deleteExpense, deleteFixedExpense, fetchSplitFixedExpenses } from './lib/api'

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

  useEffect(() => {
    async function init() {
      try {
        const groups = await getUserGroups(supabase)
        if (groups.length) {
          setCurrentGroup(groups[0])
          loadDashboardData(groups[0].id)
          getMemberProfiles(supabase, groups[0].id).then(setMembers).catch(console.error)
        }
      } catch (e) {
        console.error('init groups', e)
      }
    }
    init()
  }, [])

  const inSettings = tab === 'settings'

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header
        className="sticky top-0 z-40 border-b border-white/6 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between">
          {/* Left: back arrow (settings) or logo + group */}
          <div className="flex min-w-0 items-center gap-3">
            {inSettings ? (
              <button
                onClick={() => setTab('monthly')}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
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
                  <span className="truncate bg-slate-800/70 px-2 py-1 text-xs text-slate-300 max-w-[130px] sm:max-w-xs">
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
                <button onClick={() => setTab('monthly')} className={`font-pixel rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'monthly' ? 'bg-accent text-white' : 'text-slate-300 hover:text-white'}`}>Ledger</button>
                <button onClick={() => setTab('balances')} className={`font-pixel rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'balances' ? 'bg-accent text-white' : 'text-slate-300 hover:text-white'}`}>Balances</button>
                <span className="ml-2 max-w-[180px] truncate text-xs text-slate-400">{user.email}</span>
              </nav>
            )}
            <button
              onClick={() => setTab(inSettings ? 'monthly' : 'settings')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${inSettings ? 'bg-accent text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
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
            <div className="border-2 border-white/10 bg-slate-800/70 p-4 shadow-lg shadow-slate-950/30">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-pixel text-xs font-medium text-accent-muted">At a glance</p>
                  <h2 className="text-lg font-semibold text-white">{currentGroup?.name || 'Choose a group to begin'}</h2>
                  <p className="text-sm text-slate-400">{totalTracked} entries tracked • {fixedCount} fixed • {variableCount} variable</p>
                </div>
                <div className="border-2 border-white/10 bg-slate-900/70 px-4 py-3 text-right">
                  <p className="font-pixel text-[9px] uppercase tracking-[0.15em] text-slate-400">Current total</p>
                  <p className="text-xl font-semibold text-white">${(totalAmount / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="border-2 border-white/10 bg-slate-800/70 p-4 shadow-lg shadow-slate-950/20">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-pixel text-xs font-semibold text-white">Recent activity</h3>
                <span className="text-xs text-slate-400">Latest updates</span>
              </div>
              {recentActivity.length ? (
                <ul className="space-y-2">
                  {recentActivity.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between border-2 border-white/10 bg-slate-900/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{entry.description || 'Expense'}</p>
                        <p className="text-xs text-slate-400">{entry.is_fixed ? 'Fixed' : 'Variable'} • {entry.category || 'Other'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">${(Number(entry.amount) / 100).toFixed(2)}</p>
                        <p className="text-[11px] text-slate-400">{new Date(entry.date || entry.created_at).toLocaleDateString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No activity yet. Add your first expense using the + button.</p>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'settings' ? (
          <Settings supabase={supabase} user={user} currentGroup={currentGroup} onGroupChange={(g) => {
            setCurrentGroup(g)
            setTab('monthly')
            loadDashboardData(g?.id)
            if (g?.id) getMemberProfiles(supabase, g.id).then(setMembers).catch(console.error)
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
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/8 bg-slate-950/95 backdrop-blur-md sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button onClick={() => setTab('monthly')} className={`font-pixel flex-1 py-3 text-xs font-medium border-t-2 transition-colors ${tab === 'monthly' ? 'border-accent text-accent' : 'border-transparent text-slate-500'}`}>Ledger</button>
          <button onClick={() => setTab('balances')} className={`font-pixel flex-1 py-3 text-xs font-medium border-t-2 transition-colors ${tab === 'balances' ? 'border-accent text-accent' : 'border-transparent text-slate-500'}`}>Balances</button>
        </nav>
      )}

      <AddExpenseModal open={openAdd} onClose={() => setOpenAdd(false)} supabase={supabase} user={user} currentGroup={currentGroup} onCreated={() => loadDashboardData(currentGroup?.id)} />
      <FloatingButton onClick={() => setOpenAdd(true)} />
    </div>
  )
}
