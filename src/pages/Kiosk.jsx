import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function hashPin(pin) { return btoa('planify:' + pin) }

export default function Kiosk({ siteId, siteName }) {
  const [employees, setEmployees] = useState([])
  const [clockings, setClockings] = useState([])
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [now, setNow]             = useState(new Date())

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const reload = useCallback(async () => {
    if (!siteId) return
    const [{ data: emps }, { data: clk }] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, pin_hash').eq('site_id', siteId).eq('active', true),
      supabase.from('clockings').select('*').eq('site_id', siteId).eq('work_date', today),
    ])
    setEmployees(emps || [])
    setClockings(clk || [])
    setLoading(false)
  }, [siteId, today])

  useEffect(() => { reload() }, [reload])

  function pressDigit(d) {
    if (pin.length >= 4) return
    setError('')
    const newPin = pin + d
    setPin(newPin)
    if (newPin.length === 4) {
      setTimeout(() => validate(newPin), 150)
    }
  }

  function pressDelete() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function validate(enteredPin) {
    const hash = hashPin(enteredPin)
    const emp = employees.find(e => e.pin_hash === hash)
    if (!emp) {
      setError('Code incorrect — réessaie')
      setTimeout(() => { setPin(''); setError('') }, 1200)
      return
    }
    // Last open clocking (clock_in but no clock_out)
    const openClocking = clockings.find(c => c.employee_id === emp.id && c.clock_in && !c.clock_out)
    const now = new Date()
    try {
      if (!openClocking) {
        // New clock-in (first entry or re-entry after a break)
        await supabase.from('clockings').insert({
          employee_id: emp.id, site_id: siteId, work_date: today,
          clock_in: now.toISOString()
        })
        setSuccess({ name: emp.first_name, action: 'entrée', time: fmtTime(now.toISOString()) })
      } else {
        // Clock-out
        await supabase.from('clockings')
          .update({ clock_out: now.toISOString() })
          .eq('id', openClocking.id)
        setSuccess({ name: emp.first_name, action: 'sortie', time: fmtTime(now.toISOString()) })
      }
      await reload()
      setPin('')
      setTimeout(() => setSuccess(null), 3500)
    } catch (err) {
      setError('Erreur : ' + err.message)
      setTimeout(() => { setPin(''); setError('') }, 2000)
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#8b949e', fontSize: 18 }}>
      Chargement…
    </div>
  )

  if (success) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: success.action === 'entrée' ? '#052e16' : '#0c1a2e', gap: 20 }}>
      <div style={{ fontSize: 80 }}>{success.action === 'entrée' ? '✅' : '👋'}</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 40, color: '#fff' }}>{success.name}</div>
      <div style={{ fontSize: 26, color: success.action === 'entrée' ? '#3fb950' : '#58a6ff', fontWeight: 600 }}>
        {success.action === 'entrée' ? 'Bonne journée !' : 'À bientôt !'}
      </div>
      <div style={{ fontSize: 18, color: '#8b949e' }}>
        {success.action === 'entrée' ? 'Entrée' : 'Sortie'} enregistrée à {success.time}
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d1117', color: '#e6edf3', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid #30363d', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: '#58a6ff', letterSpacing: '-0.5px' }}>
          planify<span style={{ color: '#f59e0b' }}>.</span>ch
          {siteName && <span style={{ fontSize: 14, color: '#8b949e', fontWeight: 400, marginLeft: 14 }}>{siteName}</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 32, letterSpacing: '-1px', lineHeight: 1 }}>
            {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
          </div>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 3 }}>
            {now.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* Main — centred numpad */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, color: '#8b949e', fontWeight: 500 }}>Entrez votre code PIN</div>
          <div style={{ fontSize: 13, color: '#484f58', marginTop: 4 }}>4 chiffres pour pointer votre entrée ou sortie</div>
        </div>

        {/* PIN dots */}
        <div style={{ display: 'flex', gap: 18 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 20, height: 20, borderRadius: '50%',
              background: error ? '#f85149' : i < pin.length ? '#58a6ff' : '#30363d',
              transition: 'background .15s',
              transform: error ? 'scale(1.2)' : 'scale(1)',
            }} />
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#f85149', fontWeight: 600, textAlign: 'center', padding: '8px 20px', background: '#3d0f0f', borderRadius: 10 }}>
            {error}
          </div>
        )}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gap: 12 }}>
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
            <button key={i}
              onClick={() => d === '⌫' ? pressDelete() : d !== '' ? pressDigit(String(d)) : null}
              disabled={d === ''}
              style={{
                height: 80, borderRadius: 14,
                border: '1px solid #30363d',
                background: d === '⌫' ? '#161b22' : '#161b22',
                color: d === '⌫' ? '#6e7681' : '#e6edf3',
                fontSize: d === '⌫' ? 24 : 26,
                fontWeight: 600,
                cursor: d === '' ? 'default' : 'pointer',
                opacity: d === '' ? 0 : 1,
                fontFamily: "'Syne',sans-serif",
                transition: 'background .1s, transform .08s',
              }}
              onMouseDown={e => { if (d !== '') e.currentTarget.style.background = '#21262d'; e.currentTarget.style.transform = 'scale(0.95)' }}
              onMouseUp={e => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.transform = 'scale(1)' }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
