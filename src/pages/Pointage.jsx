import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function diffMin(inIso, outIso) {
  if (!inIso || !outIso) return null
  return Math.round((new Date(outIso) - new Date(inIso)) / 60000)
}

function fmtDuration(min) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2,'0')}`
}

function toLocalISO(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

function toTimeInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function Pointage({ site, employees, shifts, clockings, setClockings, onClockIn, onClockOut, onRefresh, fmtDate }) {
  const today = fmtDate(new Date())
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [saving, setSaving] = useState(false)

  const todayShifts = useMemo(() =>
    shifts.filter(s => s.work_date === today),
    [shifts, today]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)
    )
  }, [employees, search])

  const handleValidate = async (id) => {
    const { error } = await supabase
      .from('clockings')
      .update({ validated: true, validated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { console.error(error); return }
    setClockings(prev => prev.map(c => c.id === id ? { ...c, validated: true } : c))
  }

  const handleUnvalidate = async (id) => {
    const { error } = await supabase
      .from('clockings')
      .update({ validated: false, validated_at: null })
      .eq('id', id)
    if (error) { console.error(error); return }
    setClockings(prev => prev.map(c => c.id === id ? { ...c, validated: false, validated_at: null } : c))
  }

  const startEdit = (c) => {
    setEditId(c.id)
    setEditIn(toTimeInput(c.clock_in))
    setEditOut(toTimeInput(c.clock_out))
  }

  const saveEdit = async (c) => {
    if (!editIn) return
    setSaving(true)
    const newIn  = toLocalISO(c.work_date, editIn)
    const newOut = editOut ? toLocalISO(c.work_date, editOut) : null
    if (newOut && new Date(newOut) <= new Date(newIn)) {
      alert('La sortie doit être après l\'entrée')
      setSaving(false)
      return
    }
    const updates = { clock_in: newIn, clock_out: newOut, validated: false, validated_at: null }
    const { error } = await supabase.from('clockings').update(updates).eq('id', c.id)
    if (error) { console.error(error); setSaving(false); return }
    setClockings(prev => prev.map(x => x.id === c.id ? { ...x, ...updates } : x))
    setEditId(null)
    setSaving(false)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>
            Pointage — {site?.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
            {new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <input
          placeholder="Rechercher un employé…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '7px 12px', borderRadius: 8, fontSize: 13, width: 200, outline: 'none', fontFamily: "'DM Sans', sans-serif" }}
        />
        {onRefresh && (
          <button onClick={onRefresh} title="Rafraîchir les pointages"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            ↻
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Présents',      value: clockings.filter(c => c.work_date === today && c.clock_in && !c.clock_out).length, color: '#3fb950' },
          { label: 'Sortis',        value: clockings.filter(c => c.work_date === today && c.clock_out).length,                color: '#58a6ff' },
          { label: 'Validés',       value: clockings.filter(c => c.work_date === today && c.validated).length,                color: '#a78bfa' },
          { label: 'Sans pointage', value: employees.filter(e => !clockings.some(c => c.employee_id === e.id && c.work_date === today)).length, color: 'var(--fg2)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: "'Syne', sans-serif" }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Employee cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(emp => {
          const empClockings = clockings
            .filter(c => c.employee_id === emp.id && c.work_date === today)
            .sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))

          const now = new Date()
          const totalMin = empClockings.reduce((acc, c) => {
            if (c.clock_in && c.clock_out) return acc + diffMin(c.clock_in, c.clock_out)
            if (c.clock_in && !c.clock_out) return acc + Math.round((now - new Date(c.clock_in)) / 60000)
            return acc
          }, 0)

          const lastClocking = empClockings[empClockings.length - 1] || null
          const isIn  = lastClocking && !lastClocking.clock_out
          const isOut = lastClocking && !!lastClocking.clock_out
          const plannedShift = todayShifts.find(s => s.employee_id === emp.id)

          let statusColor = 'var(--bg3)'
          let statusLabel = 'Absent'
          if (isIn)  { statusColor = '#166534'; statusLabel = 'En service' }
          if (isOut) { statusColor = '#1e3a5f'; statusLabel = 'Sorti'      }

          return (
            <div key={emp.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Employee header row */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                  {emp.first_name[0]}{emp.last_name[0]}
                </div>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{emp.role || '—'} · {emp.contract_pct}%</div>
                </div>
                <div style={{ minWidth: 110 }}>
                  {plannedShift ? (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: plannedShift.shift_defs?.color || 'var(--accent)', fontWeight: 600 }}>
                        {plannedShift.shift_defs?.label}
                      </span>
                      <span style={{ color: 'var(--fg2)', marginLeft: 6 }}>
                        {plannedShift.start_time?.slice(0,5)}–{plannedShift.end_time?.slice(0,5)}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--fg2)' }}>Pas de shift planifié</span>
                  )}
                </div>
                <div style={{ minWidth: 80 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg2)', marginBottom: 1 }}>Total aujourd'hui</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {empClockings.length === 0 ? '—'
                      : isIn ? <span style={{ color: '#f59e0b' }}>{fmtDuration(totalMin)} <span style={{ fontSize: 10 }}>en cours</span></span>
                      : fmtDuration(totalMin)}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: statusColor, color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    {statusLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(!lastClocking || isOut) && (
                    <button onClick={() => onClockIn(emp.id)}
                      style={{ background: '#166534', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                      ▶ Entrée
                    </button>
                  )}
                  {isIn && (
                    <button onClick={() => onClockOut(lastClocking.id)}
                      style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                      ■ Sortie
                    </button>
                  )}
                </div>
              </div>

              {/* Clocking periods */}
              {empClockings.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  {empClockings.map((c, idx) => {
                    const periodMin = c.clock_out
                      ? diffMin(c.clock_in, c.clock_out)
                      : Math.round((now - new Date(c.clock_in)) / 60000)
                    const open = !c.clock_out
                    const isEditing = editId === c.id

                    return (
                      <div key={c.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px 16px 8px 60px',
                        borderBottom: idx < empClockings.length - 1 ? '1px solid var(--border)' : 'none',
                        background: c.validated ? 'rgba(167,139,250,0.06)' : 'transparent',
                      }}>
                        <div style={{ fontSize: 10, color: 'var(--fg2)', minWidth: 52 }}>
                          Période {idx + 1}
                        </div>

                        {isEditing ? (
                          /* ── EDIT MODE ── */
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: 'var(--fg2)' }}>Entrée</span>
                              <input type="time" value={editIn} onChange={e => setEditIn(e.target.value)}
                                style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', color: 'var(--fg)', padding: '4px 8px', borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
                            </div>
                            <span style={{ color: 'var(--fg2)' }}>→</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: 'var(--fg2)' }}>Sortie</span>
                              <input type="time" value={editOut} onChange={e => setEditOut(e.target.value)}
                                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '4px 8px', borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
                            </div>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => saveEdit(c)} disabled={saving}
                              style={{ background: '#166534', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                              {saving ? '…' : '✓ Sauver'}
                            </button>
                            <button onClick={() => setEditId(null)}
                              style={{ background: 'var(--bg2)', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                              Annuler
                            </button>
                          </>
                        ) : (
                          /* ── VIEW MODE ── */
                          <>
                            {/* Entrée */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 80 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950' }} />
                              <div>
                                <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Entrée</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#3fb950' }}>{fmtTime(c.clock_in)}</div>
                              </div>
                            </div>
                            <div style={{ color: 'var(--fg2)', fontSize: 11 }}>→</div>
                            {/* Sortie */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 80 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: open ? '#f59e0b' : '#58a6ff' }} />
                              <div>
                                <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Sortie</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: open ? '#f59e0b' : '#58a6ff' }}>
                                  {open ? 'En cours…' : fmtTime(c.clock_out)}
                                </div>
                              </div>
                            </div>
                            {/* Durée */}
                            <div style={{ minWidth: 60 }}>
                              <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Durée</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: open ? '#f59e0b' : 'var(--fg)' }}>
                                {fmtDuration(periodMin)}
                              </div>
                            </div>

                            <div style={{ flex: 1 }} />

                            {/* Validation actions */}
                            {c.validated ? (
                              <>
                                <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>✓ Validé</span>
                                <button onClick={() => handleUnvalidate(c.id)}
                                  style={{ background: 'none', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>
                                  ✏️ Modifier
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(c)}
                                  style={{ background: 'none', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>
                                  ✏️ Corriger
                                </button>
                                {!open && (
                                  <button onClick={() => handleValidate(c.id)}
                                    style={{ background: '#4c1d95', color: 'white', border: 'none', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                                    ✓ Valider
                                  </button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg2)', fontSize: 14 }}>
          Aucun employé trouvé
        </div>
      )}
    </div>
  )
}
