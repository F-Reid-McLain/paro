import { useEffect, useState } from 'react'
import FixedExpenses from './components/FixedExpenses'
import MonthlyLedger from './components/MonthlyLedger'
import Groups from './components/Groups'
import AddExpenseModal from './components/AddExpenseModal'
import FloatingButton from './components/FloatingButton'
import { fetchExpenses } from './lib/api'

export default function Dashboard({ user, supabase }) {
  const [tab, setTab] = useState('monthly')
  const [openAdd, setOpenAdd] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentGroup, setCurrentGroup] = useState(null)

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
        category: item.period || 'Recurring',
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

  useEffect(() => { loadDashboardData() }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-white/6 bg-slate-950/60 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Paro</h1>
            <nav className="flex gap-2">
              <button onClick={() => setTab('groups')} className={`px-3 py-2 rounded ${tab==='groups' ? 'bg-sky-500 text-white' : 'text-slate-300'}`}>Groups</button>
              <button onClick={() => setTab('fixed')} className={`px-3 py-2 rounded ${tab==='fixed' ? 'bg-sky-500 text-white' : 'text-slate-300'}`}>Fixed Expenses</button>
              <button onClick={() => setTab('monthly')} className={`px-3 py-2 rounded ${tab==='monthly' ? 'bg-sky-500 text-white' : 'text-slate-300'}`}>Monthly Ledger</button>
            </nav>
            {currentGroup ? (
              <div className="ml-4 rounded-md bg-slate-800/60 px-3 py-1 text-sm text-slate-200">Group: <span className="font-medium">{currentGroup.name}</span></div>
            ) : null}
          </div>
          <div className="text-sm text-slate-300">Signed in as <span className="font-medium">{user.email}</span></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
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

        {tab === 'groups' ? (
          <Groups supabase={supabase} user={user} onGroupChange={(g) => { setCurrentGroup(g); setTab('monthly'); loadDashboardData(g.id) }} />
        ) : tab === 'fixed' ? (
          <FixedExpenses
            supabase={supabase}
            user={user}
            currentGroup={currentGroup}
            onGroupChange={(group) => setCurrentGroup(group)}
            onChanged={(groupId) => loadDashboardData(groupId || currentGroup?.id)}
          />
        ) : (
          <MonthlyLedger supabase={supabase} user={user} expenses={[...expenses, ...fixedExpenses]} loading={loading} onRefresh={() => loadDashboardData(currentGroup?.id)} />
        )}
      </main>

      <AddExpenseModal open={openAdd} onClose={() => setOpenAdd(false)} supabase={supabase} user={user} currentGroup={currentGroup} onCreated={() => loadDashboardData(currentGroup?.id)} />
      <FloatingButton onClick={() => setOpenAdd(true)} />
    </div>
  )
}
