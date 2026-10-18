import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { shiftDuration } from '../lib/lgav'

const FR_DAYS_LONG    = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const FR_MONTHS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const FR_MONTHS_SHORT = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function dayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return (d.getDay() + 6) % 7 // 0=Mon … 6=Sun
}
function fmtShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${FR_MONTHS_SHORT[d.getMonth()]}`
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export default function KPI({ site, employees, shifts, onLoadShiftsForMonth }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based
  const [entries, setEntries] = useState({}) // { dateStr: { id, ca_prevision, ca_reel } }
  const [saving,  setSaving]  = useState({})
  const [loading, setLoading] = useState(false)

  // Dates of the month
  const dates = (() => {
    const n = daysInMonth(year, month)
    return Array.from({ length: n }, (_, i) => {
      const day = i + 1
      const mm  = String(month + 1).padStart(2, '0')
      const dd  = String(day).padStart(2, '0')
      return `${year}-${mm}-${dd}`
    })
  })()

  const dateFrom = dates[0]
  const dateTo   = dates[dates.length - 1]

  // Ask parent to load shifts for this month
  useEffect(() => {
    if (onLoadShiftsForMonth) onLoadShiftsForMonth(dateFrom, dateTo)
  }, [dateFrom, dateTo])

  // Load kpi_entries for this month
  useEffect(() => {
    if (!site?.id) return
    setLoading(true)
    supabase.from('kpi_entries')
      .select('*')
      .eq('site_id', site.id)
      .gte('work_date', dateFrom)
      .lte('work_date', dateTo)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(e => { map[e.work_date] = e })
        setEntries(map)
        setLoading(false)
      })
  }, [site?.id, dateFrom, dateTo])

  const saveField = useCallback(async (dateStr, field, rawValue) => {
    const value = rawValue === '' ? null : parseFloat(rawValue)
    if (rawValue !== '' && isNaN(value)) return
    const key = `${dateStr}_${field}`
    setSaving(s => ({ ...s, [key]: true }))
    const existing = entries[dateStr]
    if (existing) {
      const { data } = await supabase.from('kpi_entries')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select().single()
      if (data) setEntries(e => ({ ...e, [dateStr]: data }))
    } else {
      const { data } = await supabase.from('kpi_entries')
        .insert({ site_id: site.id, work_date: dateStr, [field]: value })
        .select().single()
      if (data) setEntries(e => ({ ...e, [dateStr]: data }))
    }
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
  }, [entries, site?.id])

  function getDayPayroll(dateStr) {
    const dayShifts = shifts.filter(s => s.work_date === dateStr && s.employee_id)
    return dayShifts.reduce((total, s) => {
      const emp = employees.find(e => e.id === s.employee_id)
      if (!emp?.hourly_rate) return total
      return total + shiftDuration(s.start_time, s.end_time) * emp.hourly_rate
    }, 0)
  }

  const totals = dates.reduce((acc, d) => {
    const e = entries[d] || {}
    acc.payroll   += getDayPayroll(d)
    acc.prevision += e.ca_prevision ? parseFloat(e.ca_prevision) : 0
    acc.reel      += e.ca_reel      ? parseFloat(e.ca_reel)      : 0
    return acc
  }, { payroll: 0, prevision: 0, reel: 0 })

  function navMonth(dir) {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const inputStyle = {
    background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)',
    padding: '5px 8px', borderRadius: 6, fontSize: 13, width: 110,
    textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums',
  }
  const cellStyle = { padding: '8px 16px', borderRight: '1px solid var(--border)', verticalAlign: 'middle' }
  const numCell   = { ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const thStyle   = { padding: '8px 16px', borderRight: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--fg2)', fontFamily: "'Syne',sans-serif", letterSpacing: .5, textTransform: 'uppercase', background: 'var(--bg2)', whiteSpace: 'nowrap' }
  const thNum     = { ...thStyle, textAlign: 'right' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 28px 12px', borderBottom: '1px solid var(--border2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navMonth(-1)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg2)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>‹</button>
          <div style={{ minWidth: 160, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17 }}>{FR_MONTHS_LONG[month]} {year}</div>
            <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{dates.length} jours</div>
          </div>
          <button onClick={() => navMonth(1)}  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg2)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>›</button>
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            style={{ background: 'var(--accent-dim,#1e3a5f)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            Ce mois
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { label: 'Masse salariale', value: totals.payroll,   color: '#f97316' },
            { label: 'CA prévisionnel', value: totals.prevision, color: 'var(--accent)' },
            { label: 'CA réel',         value: totals.reel,      color: '#22c55e' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', minWidth: 120, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--fg3)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>{c.label}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: c.color }}>
                {c.value > 0 ? `CHF ${c.value.toFixed(0)}` : '—'}
              </div>
              {c.label !== 'Masse salariale' && totals.payroll > 0 && c.value > 0 && (
                <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>
                  ratio {((totals.payroll / c.value) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg3)' }}>Chargement…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={thStyle}>Jour</th>
                <th style={thNum}>Shifts planifiés</th>
                <th style={thNum}>Masse salariale</th>
                <th style={thNum}>CA prévisionnel</th>
                <th style={thNum}>CA réel</th>
                <th style={{ ...thNum, borderRight: 'none' }}>Ratio MS / CA réel</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((dateStr, i) => {
                const dow    = dayOfWeek(dateStr)
                const isWE   = dow >= 5
                const entry  = entries[dateStr] || {}
                const payroll = getDayPayroll(dateStr)
                const caP    = entry.ca_prevision != null ? parseFloat(entry.ca_prevision) : null
                const caR    = entry.ca_reel      != null ? parseFloat(entry.ca_reel)      : null
                const ratio  = payroll > 0 && caR > 0 ? (payroll / caR) * 100 : null
                const dayShifts = shifts.filter(s => s.work_date === dateStr && s.employee_id)
                const rowBg  = isWE
                  ? 'color-mix(in srgb, var(--accent) 4%, var(--bg))'
                  : i % 2 === 0 ? 'var(--bg)' : 'var(--bg2)'

                return (
                  <tr key={dateStr} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 600, color: isWE ? 'var(--accent)' : 'var(--fg)' }}>
                        {FR_DAYS_LONG[dow]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{fmtShort(dateStr)}</div>
                    </td>
                    <td style={numCell}>
                      {dayShifts.length > 0 ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{dayShifts.length}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
                            {dayShifts.reduce((a, s) => a + shiftDuration(s.start_time, s.end_time), 0).toFixed(1)}h
                          </div>
                        </>
                      ) : <span style={{ color: 'var(--fg3)' }}>—</span>}
                    </td>
                    <td style={numCell}>
                      {payroll > 0
                        ? <span style={{ fontWeight: 700, color: '#f97316' }}>CHF {payroll.toFixed(2)}</span>
                        : <span style={{ color: 'var(--fg3)' }}>—</span>}
                    </td>
                    <td style={numCell}>
                      <input
                        type="number" min="0" step="10"
                        defaultValue={caP ?? ''}
                        key={`prev_${dateStr}_${caP}`}
                        placeholder="—"
                        style={{ ...inputStyle, borderColor: saving[`${dateStr}_ca_prevision`] ? 'var(--accent)' : 'var(--border)' }}
                        onBlur={e  => saveField(dateStr, 'ca_prevision', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      />
                    </td>
                    <td style={numCell}>
                      <input
                        type="number" min="0" step="10"
                        defaultValue={caR ?? ''}
                        key={`reel_${dateStr}_${caR}`}
                        placeholder="—"
                        style={{ ...inputStyle, borderColor: saving[`${dateStr}_ca_reel`] ? 'var(--accent)' : 'var(--border)' }}
                        onBlur={e  => saveField(dateStr, 'ca_reel', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      />
                    </td>
                    <td style={{ ...numCell, borderRight: 'none' }}>
                      {ratio !== null ? (
                        <span style={{ fontWeight: 700, color: ratio > 35 ? '#ef4444' : ratio > 28 ? '#f97316' : '#22c55e' }}>
                          {ratio.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: 'var(--fg3)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)', fontWeight: 700 }}>
                <td style={cellStyle}>Total {FR_MONTHS_LONG[month]}</td>
                <td style={numCell}>
                  {shifts.filter(s => s.employee_id && dates.includes(s.work_date)).length} shifts
                </td>
                <td style={numCell}>
                  <span style={{ color: '#f97316' }}>CHF {totals.payroll.toFixed(2)}</span>
                </td>
                <td style={numCell}>{totals.prevision > 0 ? `CHF ${totals.prevision.toFixed(0)}` : '—'}</td>
                <td style={numCell}>{totals.reel > 0      ? `CHF ${totals.reel.toFixed(0)}`      : '—'}</td>
                <td style={{ ...numCell, borderRight: 'none' }}>
                  {totals.payroll > 0 && totals.reel > 0 ? (
                    <span style={{ color: (totals.payroll/totals.reel*100) > 35 ? '#ef4444' : (totals.payroll/totals.reel*100) > 28 ? '#f97316' : '#22c55e' }}>
                      {(totals.payroll / totals.reel * 100).toFixed(1)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
