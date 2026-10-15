import { useState, useMemo, useEffect } from 'react'
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
  if (min == null || min < 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2,'0')}`
}

function toLocalISO(dateStr, timeStr) {
  // dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM'
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

function toTimeInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function Validation({ site, employees, siteId, fmtDate, onShowToast }) {
  const [selectedDate, setSelectedDate] = useState(fmtDate(new Date()))
  const [clockings, setClockings] = useState([])
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [saving, setSaving] = useState(false)

  // Load clockings for selected date
  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    supabase
      .from('clockings')
      .select('*, employees(first_name, last_name, role)')
      .eq('site_id', siteId)
      .eq('work_date', selectedDate)
      .order('clock_in', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        else setClockings(data || [])
        setLoading(false)
      })
  }, [siteId, selectedDate])

  // Validate a single clocking
  const handleValidate = async (id) => {
    const { error } = await supabase
      .from('clockings')
      .update({ validated: true, validated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { onShowToast('Erreur : ' + error.message, 'error'); return }
    setClockings(prev => prev.map(c => c.id === id ? { ...c, validated: true, validated_at: new Date().toISOString() } : c))
  }

  // Unvalidate (re-ouvrir pour correction)
  const handleUnvalidate = async (id) => {
    const { error } = await supabase
      .from('clockings')
      .update({ validated: false, validated_at: null })
      .eq('id', id)
    if (error) { onShowToast('Erreur : ' + error.message, 'error'); return }
    setClockings(prev => prev.map(c => c.id === id ? { ...c, validated: false, validated_at: null } : c))
  }

  // Start editing
  const startEdit = (c) => {
    setEditId(c.id)
    setEditIn(toTimeInput(c.clock_in))
    setEditOut(toTimeInput(c.clock_out))
  }

  // Save edit
  const saveEdit = async (c) => {
    if (!editIn) { onShowToast('Heure d\'entrée requise', 'error'); return }
    setSaving(true)
    const newIn  = toLocalISO(c.work_date, editIn)
    const newOut = editOut ? toLocalISO(c.work_date, editOut) : null

    // Validate times
    if (newOut && new Date(newOut) <= new Date(newIn)) {
      onShowToast('La sortie doit être après l\'entrée', 'error')
      setSaving(false)
      return
    }

    const updates = { clock_in: newIn, clock_out: newOut, validated: false, validated_at: null }
    const { error } = await supabase.from('clockings').update(updates).eq('id', c.id)
    if (error) { onShowToast('Erreur : ' + error.message, 'error'); setSaving(false); return }
    setClockings(prev => prev.map(x => x.id === c.id ? { ...x, ...updates } : x))
    setEditId(null)
    setSaving(false)
    onShowToast('Pointage corrigé ✓')
  }

  // Validate all complete clockings for this date
  const handleValidateAll = async () => {
    const toValidate = clockings.filter(c => c.clock_in && c.clock_out && !c.validated)
    if (toValidate.length === 0) { onShowToast('Rien à valider', 'success'); return }
    const ids = toValidate.map(c => c.id)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('clockings')
      .update({ validated: true, validated_at: now })
      .in('id', ids)
    if (error) { onShowToast('Erreur : ' + error.message, 'error'); return }
    setClockings(prev => prev.map(c => ids.includes(c.id) ? { ...c, validated: true, validated_at: now } : c))
    onShowToast(`${toValidate.length} pointage(s) validé(s) ✓`)
  }

  // Group by employee
  const grouped = useMemo(() => {
    const map = {}
    for (const c of clockings) {
      const empId = c.employee_id
      if (!map[empId]) map[empId] = { emp: c.employees, clockings: [] }
      map[empId].clockings.push(c)
    }
    return Object.values(map)
  }, [clockings])

  const totalValidated = clockings.filter(c => c.validated).length
  const totalPending   = clockings.filter(c => !c.validated && c.clock_in && c.clock_out).length
  const totalOpen      = clockings.filter(c => !c.clock_out).length

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>
            Validation des pointages — {site?.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
            Vérifiez et validez les pointages avant de générer les feuilles d'heures
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Date picker */}
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '7px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}
        />
        <button
          onClick={handleValidateAll}
          style={{ background: '#166534', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
          ✓ Tout valider
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Validés', value: totalValidated, color: '#3fb950' },
          { label: 'À valider', value: totalPending, color: '#f59e0b' },
          { label: 'En cours', value: totalOpen, color: '#58a6ff' },
          { label: 'Total lignes', value: clockings.length, color: 'var(--fg2)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: "'Syne', sans-serif" }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg2)' }}>Chargement…</div>
      )}

      {/* Grouped by employee */}
      {!loading && grouped.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--fg2)', fontSize: 14 }}>
          Aucun pointage pour cette date
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {grouped.map(({ emp, clockings: empRows }) => {
          const totalMin = empRows.reduce((acc, c) => {
            if (c.clock_in && c.clock_out) return acc + (diffMin(c.clock_in, c.clock_out) || 0)
            return acc
          }, 0)
          const allValidated = empRows.every(c => c.validated || !c.clock_out)
          const empName = emp ? `${emp.first_name} ${emp.last_name}` : '—'
          const initials = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?'

          return (
            <div key={empName} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Employee header */}
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: allValidated ? 'rgba(63,185,80,0.06)' : 'transparent' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{empName}</div>
                <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{emp?.role}</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Total : {fmtDuration(totalMin)}
                </div>
                {allValidated && (
                  <div style={{ background: '#166534', color: 'white', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    ✓ Tout validé
                  </div>
                )}
              </div>

              {/* Clocking rows */}
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {empRows.map((c, idx) => {
                  const isEditing = editId === c.id
                  const dur = diffMin(c.clock_in, c.clock_out)
                  const isOpen = !c.clock_out

                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px 10px 60px',
                      borderBottom: idx < empRows.length - 1 ? '1px solid var(--border)' : 'none',
                      background: c.validated ? 'rgba(63,185,80,0.04)' : isOpen ? 'rgba(245,158,11,0.04)' : 'transparent',
                    }}>
                      {/* Period label */}
                      <div style={{ fontSize: 11, color: 'var(--fg2)', minWidth: 64 }}>
                        Période {idx + 1}
                      </div>

                      {isEditing ? (
                        /* Edit mode */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--fg2)' }}>Entrée</span>
                            <input
                              type="time"
                              value={editIn}
                              onChange={e => setEditIn(e.target.value)}
                              style={{ background: 'var(--bg3)', border: '1px solid var(--accent)', color: 'var(--fg)', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                            />
                          </div>
                          <span style={{ color: 'var(--fg2)' }}>→</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--fg2)' }}>Sortie</span>
                            <input
                              type="time"
                              value={editOut}
                              onChange={e => setEditOut(e.target.value)}
                              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                            />
                          </div>
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={() => saveEdit(c)}
                            disabled={saving}
                            style={{ background: '#166534', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                            {saving ? '…' : '✓ Sauver'}
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            style={{ background: 'var(--bg3)', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                            Annuler
                          </button>
                        </>
                      ) : (
                        /* View mode */
                        <>
                          {/* Entrée */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950' }} />
                            <div>
                              <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Entrée</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#3fb950' }}>{fmtTime(c.clock_in)}</div>
                            </div>
                          </div>

                          <span style={{ color: 'var(--fg2)', fontSize: 11 }}>→</span>

                          {/* Sortie */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                            {!isOpen && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#58a6ff' }} />}
                            {isOpen  && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
                            <div>
                              <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Sortie</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: isOpen ? '#f59e0b' : '#58a6ff' }}>
                                {isOpen ? 'En cours…' : fmtTime(c.clock_out)}
                              </div>
                            </div>
                          </div>

                          {/* Duration */}
                          <div style={{ minWidth: 60 }}>
                            <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Durée</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDuration(dur)}</div>
                          </div>

                          <div style={{ flex: 1 }} />

                          {/* Status + actions */}
                          {c.validated ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3fb950', fontSize: 12, fontWeight: 600 }}>
                                ✓ Validé
                              </div>
                              <button
                                onClick={() => handleUnvalidate(c.id)}
                                style={{ background: 'var(--bg3)', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                                ✏️ Modifier
                              </button>
                            </>
                          ) : (
                            <>
                              {isOpen && (
                                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Pointage ouvert</div>
                              )}
                              <button
                                onClick={() => startEdit(c)}
                                style={{ background: 'var(--bg3)', color: 'var(--fg2)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                                ✏️ Corriger
                              </button>
                              {!isOpen && (
                                <button
                                  onClick={() => handleValidate(c.id)}
                                  style={{ background: '#166534', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
