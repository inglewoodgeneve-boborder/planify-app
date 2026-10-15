import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function EmployeePage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single()
      .then(({ data }) => setEmployee(data))
  }, [session])

  useEffect(() => {
    if (!employee) return
    const monday = getMonday(weekOffset)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    supabase
      .from('shifts')
      .select('*, shift_defs(*)')
      .eq('employee_id', employee.id)
      .gte('date', monday.toISOString().slice(0, 10))
      .lte('date', sunday.toISOString().slice(0, 10))
      .order('date')
      .then(({ data }) => setShifts(data || []))
  }, [employee, weekOffset])

  function getMonday(offset = 0) {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1 + offset * 7)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const monday = getMonday(weekOffset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  const s = {
    page: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: "'DM Sans', sans-serif", padding: '0' },
    header: { background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    logo: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.5px' },
    name: { fontSize: 13, color: 'var(--fg2)' },
    body: { padding: '20px', maxWidth: 480, margin: '0 auto' },
    weekNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    weekLabel: { fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 },
    btn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--fg)', cursor: 'pointer', fontSize: 14 },
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 },
    dayLabel: { fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--fg3)', width: 32, flexShrink: 0 },
    dateLabel: { fontSize: 13, fontWeight: 600, width: 24, flexShrink: 0 },
    shiftName: { fontSize: 14, fontWeight: 600, flex: 1 },
    shiftTime: { fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--accent)' },
    empty: { color: 'var(--fg3)', fontSize: 13, fontStyle: 'italic' },
    logout: { background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', fontSize: 13 },
    loginBox: { maxWidth: 360, margin: '80px auto', padding: 32, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16 },
    loginTitle: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 },
    loginSub: { color: 'var(--fg2)', fontSize: 14, marginBottom: 24 },
    input: { width: '100%', padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 },
    submit: { width: '100%', padding: '11px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  }

  if (loading) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg3)' }}>Chargement…</div>

  if (!session) return <SetPassword />

  const weekStart = monday.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })
  const weekEnd = days[6].toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.logo}>Planify</span>
        <div style={{ textAlign: 'right' }}>
          <div style={s.name}>{employee ? `${employee.first_name} ${employee.last_name}` : session.user.email}</div>
          <button style={s.logout} onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </div>
      <div style={s.body}>
        <div style={s.weekNav}>
          <button style={s.btn} onClick={() => setWeekOffset(w => w - 1)}>‹</button>
          <span style={s.weekLabel}>{weekStart} — {weekEnd}</span>
          <button style={s.btn} onClick={() => setWeekOffset(w => w + 1)}>›</button>
        </div>
        {days.map((d, i) => {
          const dateStr = d.toISOString().slice(0, 10)
          const dayShifts = shifts.filter(s => s.date === dateStr)
          const isToday = dateStr === new Date().toISOString().slice(0, 10)
          return (
            <div key={dateStr} style={{ ...s.card, borderColor: isToday ? 'var(--accent)' : 'var(--border)' }}>
              <span style={s.dayLabel}>{JOURS[i]}</span>
              <span style={{ ...s.dateLabel, color: isToday ? 'var(--accent)' : 'var(--fg)' }}>{d.getDate()}</span>
              {dayShifts.length === 0
                ? <span style={s.empty}>Repos</span>
                : dayShifts.map(sh => (
                    <div key={sh.id} style={{ flex: 1 }}>
                      <div style={s.shiftName}>{sh.shift_defs?.name || '—'}</div>
                      {sh.shift_defs?.start_time && (
                        <div style={s.shiftTime}>{sh.shift_defs.start_time.slice(0,5)} – {sh.shift_defs.end_time?.slice(0,5)}</div>
                      )}
                    </div>
                  ))
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Supabase envoie le token dans le hash de l'URL
  useEffect(() => {
    supabase.auth.getSession()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (password.length < 8) { setError('Minimum 8 caractères'); return }
    setSubmitting(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) { setError(error.message); return }
    setDone(true)
  }

  const s = {
    page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" },
    box: { width: '100%', maxWidth: 360, padding: 32, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, margin: '0 20px' },
    logo: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--accent)', marginBottom: 8 },
    title: { fontWeight: 700, fontSize: 18, marginBottom: 4 },
    sub: { color: 'var(--fg2)', fontSize: 14, marginBottom: 24 },
    input: { width: '100%', padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 },
    submit: { width: '100%', padding: 11, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
    error: { color: '#e55', fontSize: 13, marginBottom: 12 },
    success: { color: 'var(--accent)', fontSize: 15, fontWeight: 600 },
  }

  if (done) return (
    <div style={s.page}>
      <div style={s.box}>
        <div style={s.logo}>Planify</div>
        <div style={s.success}>✅ Mot de passe défini ! Vous pouvez vous connecter.</div>
      </div>
    </div>
  )

  return (
    <div style={s.page}>
      <div style={s.box}>
        <div style={s.logo}>Planify</div>
        <div style={s.title}>Bienvenue !</div>
        <div style={s.sub}>Choisissez votre mot de passe pour accéder à votre planning.</div>
        <form onSubmit={handleSubmit}>
          <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} style={s.input} required />
          <input type="password" placeholder="Confirmer le mot de passe" value={confirm} onChange={e => setConfirm(e.target.value)} style={s.input} required />
          {error && <div style={s.error}>{error}</div>}
          <button type="submit" disabled={submitting} style={s.submit}>{submitting ? '…' : 'Confirmer'}</button>
        </form>
      </div>
    </div>
  )
}
