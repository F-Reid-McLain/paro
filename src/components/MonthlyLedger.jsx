export default function MonthlyLedger({ expenses = [], loading = false }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Monthly Ledger</h2>
        <div className="text-sm text-slate-300">This month</div>
      </div>

      <p className="text-slate-300 mt-2">View current month, previous months, and filter by category or payer.</p>

      <div className="mt-6 rounded border border-white/6 bg-slate-800 p-4 text-slate-200">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="text-slate-400">No expenses yet.</div>
        ) : (
          <ul className="space-y-3">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded bg-slate-900/40 p-3">
                <div>
                  <div className="font-medium text-white">{e.description || 'Expense'}</div>
                  <div className="text-sm text-slate-400">{new Date(e.occurred_at).toLocaleString()}</div>
                </div>
                <div className="font-medium text-white">${(e.amount / 100).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
