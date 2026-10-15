import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// Simple 4-digit PIN hash (not crypto — just obfuscation for kiosk use)
function hashPin(pin) { return btoa('planify:' + pin) }

export default function Kiosk({ siteId, siteName }) {
  const [employees, setEmployees]   = useState([])
  const [clockings, setClockings]   = useState([])
  const [todayShifts, setTodayShifts] = useState([])
  const [selected, setSelected]     = useState(null)   // employee
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(null)   // { name, action, time }
  const [loading, setLoading]       = useState(true)
  const [now, setNow]               = useState(new Date())

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load data
  const reload = useCallback(async () => {
    if (!siteId) return
    const [{ data: emps }, { data: clk }, { data: sh }] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, role, pin_hash').eq('site_id', siteId).eq('active', true).order('last_name'),
      supabase.from('clockings').select('*').eq('site_id', siteId).eq('work_date', today),
      supabase.from('shifts').select('employee_id').eq('site_id', siteId).eq('work_date', today),
    ])
    setEmployees(emps || [])
    setClockings(clk || [])
    setTodayShifts(sh || [])
    setLoading(false)
  }, [siteId, today])

  useEffect(() => { reload() }, [reload])

  function getClocking(empId) {
    return clockings.find(c => c.employee_id === empId)
  }

  function selectEmployee(emp) {
    setSelected(emp)
    setPin('')
    setError('')
  }

  function pressDigit(d) {
    if (pin.length >= 4) return
    const newPin = pin + d
    setPin(newPin)
    if (newPin.length === 4) {
      setTimeout(() => validate(newPin), 100)
    }
  }

  function pressDelete() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function validate(enteredPin) {
    if (!selected) return
    const expected = selected.pin_hash
    if (!expected) {
      // No PIN set — any 4 digits work (or show error)
      setError('Aucun code PIN configuré pour cet employé.')
      setPin('')
      return
    }
    if (hashPin(enteredPin) !== expected) {
      setError('Code incorrect — réessaie')
      setPin('')
      return
    }
    // PIN correct — clock in or out
    const clocking = getClocking(selected.id)
    try {
      if (!clocking) {
        await supabase.from('clockings').insert({
          employee_id: selected.id, site_id: siteId, work_date: today,
          clock_in: new Date().toISOString()
        })
        setSuccess({ name: selected.first_name, action: 'entrée', time: fmtTime(new Date().toISOString()) })
      } else if (!clocking.clock_out) {
        await supabase.from('clockings').update({ clock_out: new Date().toISOString() }).eq('id', clocking.id)
        setSuccess({ name: selected.first_name, action: 'sortie', time: fmtTime(new Date().toISOString()) })
      } else {
        setError('Pointage déjà terminé pour aujourd\'hui.')
        setPin('')
        return
      }
      await reload()
      setSelected(null)
      setPin('')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Erreur : ' + err.message)
      setPin('')
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#8b949e', fontSize: 18 }}>
      Chargement…
    </div>
  )

  // Success screen
  if (success) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: success.action === 'entrée' ? '#052e16' : '#0c1a2e', gap: 16 }}>
      <div style={{ fontSize: 72 }}>{success.action === 'entrée' ? '✅' : '👋'}</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 36, color: '#fff' }}>{success.name}</div>
      <div style={{ fontSize: 24, color: success.action === 'entrée' ? '#3fb950' : '#58a6ff', fontWeight: 600 }}>
        {success.action === 'entrée' ? 'Bonne journée !' : 'À bientôt !'}
      </div>
      <div style={{ fontSize: 18, color: '#8b949e' }}>{success.action.charAt(0).toUpperCase() + success.action.slice(1)} enregistrée à {success.time}</div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d1117', color: '#e6edf3', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid #30363d', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: '#58a6ff', letterSpacing: '-0.5px' }}>
          planify<span style={{ color: '#f59e0b' }}>.</span>ch
          {siteName && <span style={{ fontSize: 14, color: '#8b949e', fontWeight: 400, marginLeft: 12 }}>{siteName}</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 28, letterSpacing: '-1px', lineHeight: 1 }}>
            {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
            {now.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Employee list */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', fontSize: 11 }}>
            Appuie sur ton nom pour pointer
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {employees.map(emp => {
              const clocking = getClocking(emp.id)
              const isIn  = clocking && !clocking.clock_out
              const isOut = clocking && clocking.clock_out
              const hasShift = todayShifts.some(s => s.employee_id === emp.id)
              const isSelected = selected?.id === emp.id

              return (
                <button key={emp.id} onClick={() => selectEmployee(emp)}
                  style={{
                    background: isSelected ? '#1f3a5f' : isIn ? '#0d2a1a' : isOut ? '#161b22' : '#161b22',
                    border: isSelected ? '2px solid #58a6ff' : isIn ? '1px solid #3fb95066' : isOut ? '1px solid #30363d' : hasShift ? '1px solid #f59e0b44' : '1px solid #30363d',
                    borderRadius: 12, padding: '16px 12px', cursor: 'pointer', textAlign: 'center',
                    transition: 'all .15s', outline: 'none',
                  }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: isIn ? '#166534' : '#21262d', border: isIn ? '2px solid #3fb950' : '2px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 16, fontWeight: 700, color: isIn ? '#3fb950' : '#58a6ff' }}>
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#e6edf3' }}>{emp.first_name}</div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{emp.last_name}</div>
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600,
                    color: isIn ? '#3fb950' : isOut ? '#58a6ff' : '#8b949e' }}>
                    {isIn ? `⬤ En service · ${fmtTime(clocking.clock_in)}` : isOut ? `✓ Sorti · ${fmtTime(clocking.clock_out)}` : hasShift ? '○ Prévu aujourd\'hui' : '– Pas de shift'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* PIN panel */}
        {selected && (
          <div style={{ width: 300, borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 20, flexShrink: 0 }}>
            <button onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 80, right: 16, background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>
              ✕
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#21262d', border: '2px solid #58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 20, fontWeight: 700, color: '#58a6ff' }}>
                {selected.first_name[0]}{selected.last_name[0]}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.first_name} {selected.last_name}</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                {(() => {
                  const c = getClocking(selected.id)
                  if (!c) return '→ Enregistrer ton entrée'
                  if (!c.clock_out) return `→ Enregistrer ta sortie (entré à ${fmtTime(c.clock_in)})`
                  return '✓ Pointage terminé'
                })()}
              </div>
            </div>

            {/* PIN dots */}
            <div style={{ display: 'flex', gap: 12 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < pin.length ? '#58a6ff' : '#30363d', transition: 'background .1s' }} />
              ))}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#f85149', fontWeight: 600, textAlign: 'center', padding: '6px 12px', background: '#3d0f0f', borderRadius: 8 }}>{error}</div>
            )}

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
                <button key={i} onClick={() => d === '⌫' ? pressDelete() : d !== '' ? pressDigit(String(d)) : null}
                  disabled={d === ''}
                  style={{
                    height: 60, borderRadius: 10, border: '1px solid #30363d',
                    background: d === '⌫' ? '#21262d' : '#161b22',
                    color: d === '⌫' ? '#8b949e' : '#e6edf3',
                    fontSize: d === '⌫' ? 20 : 22, fontWeight: 600,
                    cursor: d === '' ? 'default' : 'pointer',
                    opacity: d === '' ? 0 : 1,
                    fontFamily: "'Syne',sans-serif",
                    transition: 'background .1s',
                  }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
