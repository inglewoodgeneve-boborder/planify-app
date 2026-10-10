import { useState, useMemo } from 'react'
import { shiftDuration, weeklyHours, checkWeek, checkShift, isHoliday, isSunday, LGAV } from '../lib/lgav'

function fmtH(h) {
  if (!h && h !== 0) return '—'
  const hrs = Math.floor(h)
  const min = Math.round((h - hrs) * 60)
  return `${hrs}h${min > 0 ? String(min).padStart(2,'0') : ''}`
}

function fmtDiff(expected, actual) {
  if (actual == null) return null
  const diff = actual - expected
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${fmtH(Math.abs(diff))}`
}

export default function Rapports({ site, employees, shifts, clockings, weekDates, weekOffset, fmtDate }) {
  const [tab, setTab] = useState('semaine')
  const [selectedEmp, setSelectedEmp] = useState(null)
  const dates = weekDates(weekOffset)

  // ── Semaine courante ──────────────────────────────────────
  const weekReport = useMemo(() => {
    return employees.map(emp => {
      const empShifts = shifts.filter(s => s.employee_id === emp.id && s.start_time && s.end_time)
      const hours     = weeklyHours(empShifts)
      const expected  = emp.contract_pct / 100 * LGAV.maxHoursPerWeek
      const violations = checkWeek(empShifts)

      // Pointages
      const empClockings = clockings.filter(c => c.employee_id === emp.id)
      const clockedMin   = empClockings.reduce((acc, c) => acc + (c.duration_min || 0), 0)

      // Par jour
      const days = dates.map(d => {
        const dateStr = fmtDate(d)
        const shift   = empShifts.find(s => s.work_date === dateStr)
        const clocking = empClockings.find(c => c.work_date === dateStr)
        const shiftH  = shift ? shiftDuration(shift.start_time, shift.end_time) : 0
        const clkH    = clocking?.duration_min ? clocking.duration_min / 60 : null
        const v       = shift ? checkShift({ startTime: shift.start_time, endTime: shift.end_time, workDate: dateStr }) : []
        return { dateStr, shift, clocking, shiftH, clkH, violations: v, isHoliday: isHoliday(dateStr), isSunday: isSunday(dateStr) }
      })

      return { emp, hours, expected, violations, days, clockedMin }
    })
  }, [employees, shifts, clockings, dates, fmtDate])

  // ── Alertes CCNT ─────────────────────────────────────────
  const allViolations = useMemo(() => {
    const out = []
    weekReport.forEach(({ emp, violations, days }) => {
      violations.forEach(v => out.push({ emp, v, scope: 'semaine' }))
      days.forEach(day => day.violations.forEach(v => out.push({ emp, v, scope: day.dateStr })))
    })
    return out
  }, [weekReport])

  const TABS = [
    { id: 'semaine', label: 'Récap semaine' },
    { id: 'alertes', label: `Alertes CCNT${allViolations.length > 0 ? ` (${allViolations.length})` : ''}` },
    { id: 'pointages', label: 'Écarts pointages' },
  ]

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18 }}>
            Rapports — {site?.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
            Semaine {getISOWeek(dates[0])} ·{' '}
            {dates[0].toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}
            {' – '}
            {dates[6].toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Summary KPIs */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Heures planifiées', value: fmtH(weekReport.reduce((a, r) => a + r.hours, 0)) },
            { label: 'Violations CCNT', value: allViolations.filter(v => v.v.type === 'error').length, alert: true },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg2)', border: `1px solid ${k.alert && k.value > 0 ? '#7f1d1d' : 'var(--border)'}`, borderRadius: 9, padding: '8px 14px', textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.alert && k.value > 0 ? '#f87171' : 'var(--fg)', fontFamily: "'Syne', sans-serif" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--fg2)' }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t.id ? 'var(--accent)' : 'var(--fg2)', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, fontFamily: "'DM Sans', sans-serif", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Récap semaine ─── */}
      {tab === 'semaine' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--fg2)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, minWidth: 160 }}>Employé</th>
                {dates.map(d => (
                  <th key={d} style={{ textAlign: 'center', padding: '8px 8px', borderBottom: '1px solid var(--border)', fontWeight: 500, minWidth: 64, color: isSunday(fmtDate(d)) ? '#f87171' : isHoliday(fmtDate(d)) ? '#fbbf24' : 'var(--fg2)' }}>
                    {d.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
                <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, minWidth: 72 }}>Total</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, minWidth: 72 }}>Contrat</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, minWidth: 72 }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {weekReport.map(({ emp, hours, expected, violations, days }) => {
                const hasError = violations.some(v => v.type === 'error') || days.some(d => d.violations.some(v => v.type === 'error'))
                const diff = hours - expected
                return (
                  <tr key={emp.id}
                    onClick={() => setSelectedEmp(selectedEmp === emp.id ? null : emp.id)}
                    style={{ cursor: 'pointer', background: selectedEmp === emp.id ? 'var(--accent-dim)' : 'transparent', transition: 'background 0.1s' }}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hasError && <span style={{ color: '#f87171', fontSize: 14 }}>⚠</span>}
                        <div>
                          <div style={{ fontWeight: 500 }}>{emp.first_name} {emp.last_name}</div>
                          <div style={{ color: 'var(--fg2)', fontSize: 10 }}>{emp.role} · {emp.contract_pct}%</div>
                        </div>
                      </div>
                    </td>
                    {days.map(day => (
                      <td key={day.dateStr} style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                        {day.shift ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ background: day.shift.shift_defs?.color || 'var(--accent)', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>
                              {day.shift.shift_defs?.label}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--fg2)' }}>{fmtH(day.shiftH)}</div>
                            {day.violations.some(v => v.type === 'error') && <span style={{ fontSize: 10, color: '#f87171' }}>⚠</span>}
                            {day.isHoliday && <span style={{ fontSize: 9, color: '#fbbf24' }}>FÉRIÉ</span>}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--bg3)', fontSize: 14 }}>·</span>
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: hours > LGAV.maxHoursPerWeek ? '#f87171' : hours > 40 ? '#f59e0b' : 'var(--fg)' }}>
                      {fmtH(hours)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg2)' }}>
                      {fmtH(expected)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: Math.abs(diff) < 0.5 ? '#3fb950' : diff > 0 ? '#f87171' : '#f59e0b' }}>
                      {diff >= 0 ? '+' : ''}{fmtH(Math.abs(diff))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12 }}>TOTAL SITE</td>
                {dates.map(d => {
                  const dateStr = fmtDate(d)
                  const dayTotal = shifts.filter(s => s.work_date === dateStr && s.start_time)
                    .reduce((a, s) => a + shiftDuration(s.start_time, s.end_time), 0)
                  return (
                    <td key={d} style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600, fontSize: 11 }}>
                      {dayTotal > 0 ? fmtH(dayTotal) : ''}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>
                  {fmtH(weekReport.reduce((a, r) => a + r.hours, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ─── Tab: Alertes CCNT ─── */}
      {tab === 'alertes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allViolations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#3fb950', fontSize: 16, fontWeight: 600 }}>
              ✓ Aucune violation CCNT cette semaine
            </div>
          ) : (
            allViolations.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--bg2)', border: `1px solid ${item.v.type === 'error' ? '#7f1d1d' : item.v.type === 'warning' ? '#78350f' : 'var(--border)'}`, borderRadius: 9, padding: '10px 14px' }}>
                <span style={{ fontSize: 16 }}>
                  {item.v.type === 'error' ? '🔴' : item.v.type === 'warning' ? '🟡' : '🔵'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                    {item.emp.first_name} {item.emp.last_name}
                    <span style={{ fontWeight: 400, color: 'var(--fg2)', marginLeft: 8 }}>
                      {item.scope === 'semaine' ? 'Semaine' : new Date(item.scope + 'T00:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: item.v.type === 'error' ? '#fca5a5' : item.v.type === 'warning' ? '#fcd34d' : '#93c5fd' }}>
                    {item.v.msg}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg2)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
                  {item.v.code}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Tab: Écarts pointages ─── */}
      {tab === 'pointages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weekReport.map(({ emp, hours, days, clockedMin }) => {
            const clockedH = clockedMin / 60
            const diff = clockedH - hours
            const hasDiff = Math.abs(diff) > 0.25

            return (
              <div key={emp.id} style={{ background: 'var(--bg2)', border: `1px solid ${hasDiff ? '#78350f' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hasDiff ? 10 : 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{emp.role}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--fg2)', fontSize: 10 }}>Planifié</div>
                      <div style={{ fontWeight: 600 }}>{fmtH(hours)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--fg2)', fontSize: 10 }}>Pointé</div>
                      <div style={{ fontWeight: 600 }}>{clockedMin > 0 ? fmtH(clockedH) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 56 }}>
                      <div style={{ color: 'var(--fg2)', fontSize: 10 }}>Écart</div>
                      <div style={{ fontWeight: 700, color: !hasDiff ? '#3fb950' : diff > 0 ? '#f87171' : '#fbbf24' }}>
                        {clockedMin > 0 ? (diff >= 0 ? '+' : '') + fmtH(Math.abs(diff)) : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {hasDiff && clockedMin > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {days.filter(d => d.clocking || d.shift).map(day => {
                      const dClkH = day.clocking?.duration_min ? day.clocking.duration_min / 60 : null
                      const d     = dClkH != null ? dClkH - day.shiftH : null
                      if (Math.abs(d || 0) < 0.1) return null
                      return (
                        <div key={day.dateStr} style={{ background: 'var(--bg3)', borderRadius: 7, padding: '4px 10px', fontSize: 11 }}>
                          <span style={{ color: 'var(--fg2)' }}>{new Date(day.dateStr + 'T00:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric' })} </span>
                          <span style={{ color: d > 0 ? '#f87171' : '#fbbf24', fontWeight: 600 }}>
                            {d >= 0 ? '+' : ''}{fmtH(Math.abs(d))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}
