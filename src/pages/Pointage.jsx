import { useState, useMemo } from 'react'
import { shiftDuration } from '../lib/lgav'

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

export default function Pointage({ site, employees, shifts, clockings, onClockIn, onClockOut, fmtDate }) {
  const today = fmtDate(new Date())
  const [search, setSearch] = useState('')

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
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Présents', value: clockings.filter(c => c.work_date === today && c.clock_in && !c.clock_out).length, color: '#3fb950' },
          { label: 'Sortis', value: clockings.filter(c => c.work_date === today && c.clock_out).length, color: '#58a6ff' },
          { label: 'Planifiés', value: todayShifts.filter(s => s.start_time).length, color: '#f59e0b' },
          { label: 'Sans pointage', value: employees.filter(e => !clockings.some(c => c.employee_id === e.id && c.work_date === today)).length, color: 'var(--fg2)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: "'Syne', sans-serif" }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Employee cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(emp => {
          const clocking = clockings.find(c => c.employee_id === emp.id && c.work_date === today)
          const plannedShift = todayShifts.find(s => s.employee_id === emp.id)
          const isIn  = clocking && !clocking.clock_out
          const isOut = clocking && clocking.clock_out
          const dur   = clocking ? diffMin(clocking.clock_in, clocking.clock_out) : null

          let statusColor = 'var(--bg3)'
          let statusLabel = 'Absent'
          if (isIn)  { statusColor = '#166534'; statusLabel = 'En service' }
          if (isOut) { statusColor = '#1e3a5f'; statusLabel = 'Sorti'      }

          return (
            <div key={emp.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                {emp.first_name[0]}{emp.last_name[0]}
              </div>

              {/* Name + role */}
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.first_name} {emp.last_name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{emp.role || '—'} · {emp.contract_pct}%</div>
              </div>

              {/* Planned shift */}
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

              {/* Clock times */}
              <div style={{ display: 'flex', gap: 20, minWidth: 160 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--fg2)', marginBottom: 1 }}>Entrée</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: isIn || isOut ? '#3fb950' : 'var(--fg2)' }}>
                    {fmtTime(clocking?.clock_in)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--fg2)', marginBottom: 1 }}>Sortie</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: isOut ? '#58a6ff' : 'var(--fg2)' }}>
                    {fmtTime(clocking?.clock_out)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--fg2)', marginBottom: 1 }}>Durée</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {dur != null ? fmtDuration(dur) : (isIn ? <span style={{ color: '#f59e0b' }}>En cours…</span> : '—')}
                  </div>
                </div>
              </div>

              {/* Status badge */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <div style={{ background: statusColor, color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  {statusLabel}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {!clocking && (
                  <button
                    onClick={() => onClockIn(emp.id)}
                    style={{ background: '#166534', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                    ▶ Entrée
                  </button>
                )}
                {isIn && (
                  <button
                    onClick={() => onClockOut(clocking.id)}
                    style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                    ■ Sortie
                  </button>
                )}
                {isOut && (
                  <div style={{ fontSize: 11, color: 'var(--fg2)', fontStyle: 'italic' }}>Terminé</div>
                )}
              </div>
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
