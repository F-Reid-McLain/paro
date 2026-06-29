import { useEffect, useState } from 'react'
import MonthlyLedger from './components/MonthlyLedger'
import Balances from './components/Balances'
import Settings from './components/Settings'
import AddExpenseModal from './components/AddExpenseModal'
import FloatingButton from './components/FloatingButton'
import { fetchExpenses, getUserGroups, getMemberProfiles, deleteExpense, deleteFixedExpense } from './lib/api'

export default function Dashboard({ user, supabase }) {
  const [tab, setTab] = useState('monthly')
  const [openAdd, setOpenAdd] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentGroup, setCurrentGroup] = useState(null)
  const [members, setMembers] = useState({})

  const totalTracked = expenses.length + fixedExpenses.length
  const totalAmount = expenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0) + fixedExpenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
  const fixedCount = fixedExpenses.length
  const variableCount = expenses.length
  const recentActivity = [...expenses, ...fixedExpenses]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
    .slice(0, 4)

  async function loadDashboardData(groupId = currentGroup?.id) {
    setLoading(true)
    try {
      if (!groupId) {
        setExpenses([])
        setFixedExpenses([])
        return
      }

      const rows = await fetchExpenses(supabase, { group_id: groupId })
      const { data: fixedRows, error: fixedError } = await supabase
        .from('fixed_expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })

      if (fixedError) throw fixedError

      const normalizedFixed = (fixedRows || []).map((item) => ({
        id: item.id,
        description: item.name,
        amount: item.amount,
        date: item.start_date || item.created_at,
        is_fixed: true,
        is_split: item.is_split || false,
        period: item.period,
        category: 'Fixed',
        created_at: item.created_at,
      }))

      setExpenses(rows)
      setFixedExpenses(normalizedFixed)
    } catch (e) {
      console.error('fetch dashboard data', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id, isFixed) {
    try {
      if (isFixed) {
        await deleteFixedExpense(supabase, id)
      } else {
        await deleteExpense(supabase, id)
      }
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header — padded for iPhone notch/Dynamic Island */}
      <header
        className="sticky top-0 z-40 border-b border-white/6 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="shrink-0 text-lg font-semibold">Paro</h1>
            {currentGroup ? (
              <span className="truncate rounded-md bg-slate-800/70 px-2 py-1 text-xs text-slate-300 max-w-[130px] sm:max-w-xs">
                {currentGroup.name}
              </span>
            ) : null}
          </div>
          {/* Desktop nav — hidden on mobile (bottom tab bar handles it) */}
          <nav className="hidden sm:flex items-center gap-1">
            <button onClick={() => setTab('monthly')} className={`rounded px-3 py-1.5 text-sm font-medium transition ${tab === 'monthly' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:text-white'}`}>Ledger</button>
            <button onClick={() => setTab('balances')} className={`rounded px-3 py-1.5 text-sm font-medium transition ${tab === 'balances' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:text-white'}`}>Balances</button>
            <button onClick={() => setTab('settings')} className={`rounded px-3 py-1.5 text-sm font-medium transition ${tab === 'settings' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:text-white'}`}>Settings</button>
            <span className="ml-3 max-w-[180px] truncate text-xs text-slate-400">{user.email}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-10">
        {tab === 'monthly' ? (
          <div className="mb-6 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-4 shadow-lg shadow-slate-950/30">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-300">At a glance</p>
                  <h2 className="text-lg font-semibold text-white">{currentGroup?.name || 'Choose a group to begin'}</h2>
                  <p className="text-sm text-slate-400">{totalTracked} entries tracked • {fixedCount} fixed • {variableCount} variable</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Current total</p>
                  <p className="text-xl font-semibold text-white">${(totalAmount / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-4 shadow-lg shadow-slate-950/20">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Recent activity</h3>
                <span className="text-xs text-slate-400">Latest updates</span>
              </div>
              {recentActivity.length ? (
                <ul className="space-y-2">
                  {recentActivity.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{entry.description || 'Expense'}</p>
                        <p className="text-xs text-slate-400">{entry.is_fixed ? 'Fixed expense' : 'Variable expense'} • {entry.category || 'Other'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">${(Number(entry.amount) / 100).toFixed(2)}</p>
                        <p className="text-[11px] text-slate-400">{new Date(entry.date || entry.created_at).toLocaleDateString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No activity yet. Add your first expense to see it here.</p>
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
          <MonthlyLedger supabase={supabase} user={user} expenses={[...expenses, ...fixedExpenses]} loading={loading} members={members} onRefresh={() => loadDashboardData(currentGroup?.id)} onDelete={handleDelete} />
        )}
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/8 bg-slate-950/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button onClick={() => setTab('monthly')} className={`flex-1 py-3 text-sm font-medium border-t-2 transition-colors ${tab === 'monthly' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500'}`}>Ledger</button>
        <button onClick={() => setTab('balances')} className={`flex-1 py-3 text-sm font-medium border-t-2 transition-colors ${tab === 'balances' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500'}`}>Balances</button>
        <button onClick={() => setTab('settings')} className={`flex-1 py-3 text-sm font-medium border-t-2 transition-colors ${tab === 'settings' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500'}`}>Settings</button>
      </nav>

      <AddExpenseModal open={openAdd} onClose={() => setOpenAdd(false)} supabase={supabase} user={user} currentGroup={currentGroup} onCreated={(created) => loadDashboardData(currentGroup?.id || created?.group_id)} />
      <FloatingButton onClick={() => setOpenAdd(true)} />
    </div>
  )
}
