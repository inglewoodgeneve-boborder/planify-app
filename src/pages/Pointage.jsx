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

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Pointage({ site, employees, shifts, clockings: todayClockings, setClockings: setTodayClockings, onClockIn, onClockOut, onRefresh, fmtDate, siteId }) {
  const today = fmtDate(new Date())

  // Tab: 'pending' | 'validated'
  const [tab, setTab] = useState('pending')

  // Date range for the list views
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 13)
    return fmtDate(d)
  })
  const [dateTo, setDateTo] = useState(today)

  // Clockings loaded for the range
  const [rangeClockings, setRangeClockings] = useState([])
  const [loadingRange, setLoadingRange] = useState(false)

  // Collapsed dates
  const [collapsed, setCollapsed] = useState({})

  // Edit state
  const [editId, setEditId] = useState(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [saving, setSaving] = useState(false)

  // Load clockings for date range
  useEffect(() => {
    if (!siteId) return
    setLoadingRange(true)
    supabase
      .from('clockings')
      .select('*, employees(first_name, last_name, role)')
      .eq('site_id', siteId)
      .gte('work_date', dateFrom)
      .lte('work_date', dateTo)
      .order('work_date', { ascending: false })
      .order('clock_in',  { ascending: true })
      .then(({ data, error }) => {
        if (!error) setRangeClockings(data || [])
        setLoadingRange(false)
      })
  }, [siteId, dateFrom, dateTo])

  // Merge today's live clockings into rangeClockings
  const allClockings = useMemo(() => {
    const todayIds = new Set(todayClockings.map(c => c.id))
    const base = rangeClockings.filter(c => c.work_date !== today)
    // today: use live state (includes realtime updates)
    return [...base, ...todayClockings.map(c => ({
      ...c,
      employees: c.employees || employees.find(e => e.id === c.employee_id)
    }))]
  }, [rangeClockings, todayClockings, today, employees])

  const pending   = allClockings.filter(c => !c.validated)
  const validated = allClockings.filter(c =>  c.validated)

  // Group by date
  function groupByDate(list) {
    const map = {}
    for (const c of list) {
      if (!map[c.work_date]) map[c.work_date] = []
      map[c.work_date].push(c)
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }

  const updateClocking = (updated) => {
    setRangeClockings(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setTodayClockings(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
  }

  const handleValidate = async (id) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('clockings').update({ validated: true, validated_at: now }).eq('id', id)
    if (!error) updateClocking({ id, validated: true, validated_at: now })
  }

  const handleUnvalidate = async (id) => {
    const { error } = await supabase.from('clockings').update({ validated: false, validated_at: null }).eq('id', id)
    if (!error) updateClocking({ id, validated: false, validated_at: null })
  }

  const startEdit = (c) => {
    setEditId(c.id); setEditIn(toTimeInput(c.clock_in)); setEditOut(toTimeInput(c.clock_out))
  }

  const saveEdit = async (c) => {
    if (!editIn) return
    setSaving(true)
    const newIn  = toLocalISO(c.work_date, editIn)
    const newOut = editOut ? toLocalISO(c.work_date, editOut) : null
    if (newOut && new Date(newOut) <= new Date(newIn)) {
      alert('La sortie doit être après l\'entrée'); setSaving(false); return
    }
    const updates = { clock_in: newIn, clock_out: newOut, validated: false, validated_at: null }
    const { error } = await supabase.from('clockings').update(updates).eq('id', c.id)
    if (!error) { updateClocking({ id: c.id, ...updates }); setEditId(null) }
    setSaving(false)
  }

  const toggleDate = (date) => setCollapsed(prev => ({ ...prev, [date]: !prev[date] }))

  // Render a single clocking row
  const renderRow = (c) => {
    const open = !c.clock_out
    const dur  = open ? null : diffMin(c.clock_in, c.clock_out)
    const isEditing = editId === c.id
    const emp = c.employees
    const empName = emp ? `${emp.first_name} ${emp.last_name}` : '—'
    const initials = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?'

    return (
      <div key={c.id} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px',
        borderBottom: '1px solid var(--border)',
        background: c.validated ? 'rgba(167,139,250,0.05)' : 'transparent',
      }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{empName}</div>
        </div>

        {isEditing ? (
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
          <>
            {/* Entrée */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 75 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Entrée</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#3fb950' }}>{fmtTime(c.clock_in)}</div>
              </div>
            </div>
            <div style={{ color: 'var(--fg2)', fontSize: 11 }}>→</div>
            {/* Sortie */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 75 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: open ? '#f59e0b' : '#58a6ff', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Sortie</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: open ? '#f59e0b' : '#58a6ff' }}>
                  {open ? 'En cours…' : fmtTime(c.clock_out)}
                </div>
              </div>
            </div>
            {/* Durée */}
            <div style={{ minWidth: 55 }}>
              <div style={{ fontSize: 9, color: 'var(--fg2)' }}>Durée</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{open ? '—' : fmtDuration(dur)}</div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Actions */}
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
  }

  const renderDateGroups = (list) => {
    const groups = groupByDate(list)
    if (groups.length === 0) return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--fg2)', fontSize: 14 }}>
        Aucun pointage sur cette période
      </div>
    )
    return groups.map(([date, rows]) => {
      const isOpen = !collapsed[date]
      const totalMin = rows.reduce((acc, c) => {
        if (c.clock_in && c.clock_out) return acc + (diffMin(c.clock_in, c.clock_out) || 0)
        return acc
      }, 0)
      return (
        <div key={date} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
          {/* Date header */}
          <button onClick={() => toggleDate(date)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg)', fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
          }}>
            <span style={{ fontSize: 13, color: 'var(--fg2)', transition: 'transform .15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Syne', sans-serif" }}>
              {fmtDateLabel(date)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg2)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)' }}>
              {rows.length} pointage{rows.length > 1 ? 's' : ''}
            </span>
            {totalMin > 0 && (
              <span style={{ fontSize: 11, color: 'var(--fg2)' }}>
                · {fmtDuration(totalMin)} total
              </span>
            )}
            {/* Today badge */}
            {date === today && (
              <span style={{ fontSize: 10, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                Aujourd'hui
              </span>
            )}
            <div style={{ flex: 1 }} />
          </button>

          {/* Rows */}
          {isOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {rows.map(renderRow)}
            </div>
          )}
        </div>
      )
    })
  }

  // Today live stats (for the top bar on pending tab)
  const todayPending   = todayClockings.filter(c => !c.validated && c.clock_in && c.clock_out).length
  const todayPresent   = todayClockings.filter(c => c.clock_in && !c.clock_out).length
  const todayValidated = allClockings.filter(c => c.validated).length

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>
            Pointage — {site?.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
            {new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {onRefresh && (
          <button onClick={onRefresh} title="Rafraîchir"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>
            ↻
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'pending',   label: '⏳ À valider', count: pending.length },
          { id: 'validated', label: '✓ Validés',    count: validated.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--accent)' : 'none',
            color: tab === t.id ? 'white' : 'var(--fg2)',
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg3)',
                color: tab === t.id ? 'white' : 'var(--fg2)',
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Stats row (today) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'En service', value: todayPresent,   color: '#3fb950' },
          { label: 'À valider',  value: todayPending,   color: '#f59e0b' },
          { label: 'Validés',    value: todayValidated, color: '#a78bfa' },
          { label: 'Employés',   value: employees.length, color: 'var(--fg2)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Date range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--fg2)' }}>Période :</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '6px 10px', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
        <span style={{ color: 'var(--fg2)', fontSize: 12 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '6px 10px', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
        {loadingRange && <span style={{ fontSize: 11, color: 'var(--fg2)' }}>Chargement…</span>}
      </div>

      {/* Content */}
      {tab === 'pending'   && renderDateGroups(pending)}
      {tab === 'validated' && renderDateGroups(validated)}
    </div>
  )
}
