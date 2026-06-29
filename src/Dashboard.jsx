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
  const [loading, setLoading] = useState(false)

  async function loadExpenses() {
    setLoading(true)
    try {
      const rows = await fetchExpenses(supabase)
      setExpenses(rows)
    } catch (e) {
      console.error('fetch expenses', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadExpenses() }, [])

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
          </div>
          <div className="text-sm text-slate-300">Signed in as <span className="font-medium">{user.email}</span></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {tab === 'groups' ? (
          <Groups supabase={supabase} user={user} onGroupChange={(g) => { setTab('monthly'); loadExpenses() }} />
        ) : tab === 'fixed' ? (
          <FixedExpenses supabase={supabase} />
        ) : (
          <MonthlyLedger supabase={supabase} expenses={expenses} loading={loading} />
        )}
      </main>

      <AddExpenseModal open={openAdd} onClose={() => setOpenAdd(false)} supabase={supabase} user={user} onCreated={(exp) => { console.log('created', exp); loadExpenses() }} />
      <FloatingButton onClick={() => setOpenAdd(true)} />
    </div>
  )
}
