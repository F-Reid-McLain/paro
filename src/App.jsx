import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getSupabaseConfigMessage, isSupabaseConfigured, supabase } from './lib/supabase'
import Dashboard from './Dashboard'

function App() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Poll for updates every 60 seconds while the app is open
      if (registration) setInterval(() => registration.update(), 60 * 1000)
    },
  })

  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!supabase) return undefined

    let isMounted = true

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (isMounted) {
        setUser(session?.user ?? null)
      }
    }

    loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null)
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase) {
      setMessage(getSupabaseConfigMessage())
      return
    }

    setLoading(true)
    setMessage('')

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/`,
          },
        })

        if (error) throw error

        if (data.user && !data.session) {
          setMessage('Check your inbox for the confirmation email before signing in.')
        } else {
          setMessage('Account created. You are signed in.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setMessage('Signed in successfully.')
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong while contacting Supabase.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    if (!supabase) return

    const { error } = await supabase.auth.signOut()
    if (error) {
      setMessage(error.message)
      return
    }

    localStorage.removeItem('paro-group-id')
    setUser(null)
    setMessage('Signed out.')
  }

  if (user) {
    return (
      <>
        {needRefresh && (
          <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between gap-4 bg-accent px-4 py-2.5 text-sm font-medium text-hi shadow-lg">
            <span>New version available</span>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="rounded-lg border border-white/30 px-3 py-1 text-xs font-semibold hover:bg-white/10 transition-colors"
            >
              Update now
            </button>
          </div>
        )}
        <Dashboard user={user} supabase={supabase} />
      </>
    )
  }

  return (
    <main className="min-h-screen bg-page text-hi">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <section className="max-w-2xl space-y-6">
          <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm font-medium text-lo">
            Shared expenses, simplified
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-hi sm:text-5xl">
              Keep household and group costs clear without the spreadsheet hassle.
            </h1>
            <p className="max-w-xl text-lg text-lo">
              Paro brings together shared bills, recurring expenses, and monthly summaries in one calm place so everyone can stay on the same page.
            </p>
          </div>

          <ul className="space-y-3 rounded-2xl border border-def bg-white/5 p-6 text-sm text-lo shadow-2xl shadow-slate-950/30">
            <li>• Create or join a shared group in seconds.</li>
            <li>• Track fixed bills and everyday spending together.</li>
            <li>• Review a monthly ledger that makes costs easy to understand.</li>
            <li>• Designed to feel simple on mobile and desktop.</li>
          </ul>
        </section>

        <section className="w-full max-w-md rounded-3xl border border-def bg-deep p-6 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <div className="mb-6 flex rounded-full border border-def bg-card p-1">
            <button
              type="button"
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'signup' ? 'bg-accent text-hi' : 'text-lo'}`}
              onClick={() => setMode('signup')}
            >
              Create account
            </button>
            <button
              type="button"
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'signin' ? 'bg-accent text-hi' : 'text-lo'}`}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
          </div>

          {user ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                Signed in as <span className="font-semibold">{user.email}</span>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-card px-4 py-3 font-medium text-hi transition hover:bg-input"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === 'signup' ? (
                <input
                  className="w-full rounded-2xl border border-def bg-card px-4 py-3 text-hi outline-none ring-0 placeholder:text-dim"
                  type="text"
                  placeholder="Your name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              ) : null}
              <input
                className="w-full rounded-2xl border border-def bg-card px-4 py-3 text-hi outline-none ring-0 placeholder:text-dim"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                className="w-full rounded-2xl border border-def bg-card px-4 py-3 text-hi outline-none ring-0 placeholder:text-dim"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading || !isSupabaseConfigured}
                className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-hi transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-input"
              >
                {loading ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          )}

          {message ? <p className="mt-4 text-sm text-lo">{message}</p> : null}
          {!isSupabaseConfigured ? (
            <p className="mt-4 text-sm text-amber-300">{getSupabaseConfigMessage()}</p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default App
