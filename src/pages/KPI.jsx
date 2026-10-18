import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { shiftDuration } from '../lib/lgav'

const FR_DAYS_LONG  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const FR_MONTHS_SHORT = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function fmt(d) {
  return `${d.getDate()} ${FR_MONTHS_SHORT[d.getMonth()]}`
}
function dayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return (d.getDay() + 6) % 7 // 0=Mon … 6=Sun
}

export default function KPI({ site, activePeriod, employees, shifts }) {
  const [entries, setEntries]   = useState({}) // { dateStr: { id, ca_prevision, ca_reel } }
  const [saving, setSaving]     = useState({}) // { dateStr_field: true }
  const [loading, setLoading]   = useState(false)

  // Build list of dates in the period
  const dates = (() => {
    if (!activePeriod) return []
    const arr = []
    const cur = new Date(activePeriod.date_from + 'T00:00:00')
    const end = new Date(activePeriod.date_to   + 'T00:00:00')
    while (cur <= end) { arr.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
    return arr
  })()

  // Load kpi_entries for this period
  useEffect(() => {
    if (!activePeriod || !site?.id) return
    setLoading(true)
    supabase.from('kpi_entries')
      .select('*')
      .eq('site_id', site.id)
      .eq('period_id', activePeriod.id)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(e => { map[e.work_date] = e })
        setEntries(map)
        setLoading(false)
      })
  }, [activePeriod, site?.id])

  // Upsert a field for a date
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
        .insert({ site_id: site.id, period_id: activePeriod.id, work_date: dateStr, [field]: value })
        .select().single()
      if (data) setEntries(e => ({ ...e, [dateStr]: data }))
    }
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
  }, [entries, site?.id, activePeriod])

  // Compute payroll for a date from shifts
  function getDayPayroll(dateStr) {
    const dayShifts = shifts.filter(s => s.work_date === dateStr && s.employee_id)
    let total = 0
    for (const s of dayShifts) {
      const emp = employees.find(e => e.id === s.employee_id)
      if (!emp?.hourly_rate) continue
      const hours = shiftDuration(s.start_time, s.end_time)
      total += hours * emp.hourly_rate
    }
    return total
  }

  // Totals
  const totals = dates.reduce((acc, d) => {
    const e = entries[d] || {}
    acc.payroll    += getDayPayroll(d)
    acc.prevision  += e.ca_prevision ? parseFloat(e.ca_prevision) : 0
    acc.reel       += e.ca_reel      ? parseFloat(e.ca_reel)      : 0
    return acc
  }, { payroll: 0, prevision: 0, reel: 0 })

  if (!activePeriod) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg3)', fontSize: 14 }}>
      Ouvre une période de planning pour voir les KPI
    </div>
  )

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
      <div style={{ padding: '16px 28px 12px', borderBottom: '1px solid var(--border2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18 }}>KPI · {activePeriod.name}</div>
          <div style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 3 }}>{activePeriod.date_from} → {activePeriod.date_to} · {dates.length} jours</div>
        </div>
        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Masse salariale', value: totals.payroll, color: '#f97316' },
            { label: 'CA prévisionnel', value: totals.prevision, color: 'var(--accent)' },
            { label: 'CA réel', value: totals.reel, color: '#22c55e' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', minWidth: 130, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--fg3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>{c.label}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: c.color }}>
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
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
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
                const d   = new Date(dateStr + 'T00:00:00')
                const dow = dayOfWeek(dateStr)
                const isWE = dow >= 5
                const entry = entries[dateStr] || {}
                const payroll = getDayPayroll(dateStr)
                const caP  = entry.ca_prevision ? parseFloat(entry.ca_prevision) : null
                const caR  = entry.ca_reel      ? parseFloat(entry.ca_reel)      : null
                const ratio = payroll > 0 && caR > 0 ? (payroll / caR) * 100 : null
                const dayShifts = shifts.filter(s => s.work_date === dateStr && s.employee_id)
                const rowBg = isWE ? 'color-mix(in srgb, var(--accent) 3%, var(--bg))' : i % 2 === 0 ? 'var(--bg)' : 'var(--bg2)'

                return (
                  <tr key={dateStr} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 600, color: isWE ? 'var(--accent)' : 'var(--fg)' }}>{FR_DAYS_LONG[dow]}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{fmt(d)}</div>
                    </td>
                    <td style={numCell}>
                      <div style={{ fontWeight: 600 }}>{dayShifts.length}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
                        {dayShifts.reduce((a, s) => a + shiftDuration(s.start_time, s.end_time), 0).toFixed(1)}h
                      </div>
                    </td>
                    <td style={numCell}>
                      {payroll > 0 ? (
                        <span style={{ fontWeight: 700, color: '#f97316' }}>CHF {payroll.toFixed(2)}</span>
                      ) : <span style={{ color: 'var(--fg3)' }}>—</span>}
                    </td>
                    <td style={numCell}>
                      <input
                        type="number" min="0" step="10"
                        defaultValue={entry.ca_prevision ?? ''}
                        key={`${dateStr}_prev_${entry.ca_prevision}`}
                        placeholder="0"
                        style={{ ...inputStyle, borderColor: saving[`${dateStr}_ca_prevision`] ? 'var(--accent)' : 'var(--border)' }}
                        onBlur={e => saveField(dateStr, 'ca_prevision', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      />
                    </td>
                    <td style={numCell}>
                      <input
                        type="number" min="0" step="10"
                        defaultValue={entry.ca_reel ?? ''}
                        key={`${dateStr}_reel_${entry.ca_reel}`}
                        placeholder="0"
                        style={{ ...inputStyle, borderColor: saving[`${dateStr}_ca_reel`] ? 'var(--accent)' : 'var(--border)' }}
                        onBlur={e => saveField(dateStr, 'ca_reel', e.target.value)}
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
            {/* Totals row */}
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)', fontWeight: 700 }}>
                <td style={cellStyle}>Total période</td>
                <td style={numCell}>
                  {shifts.filter(s => s.employee_id && dates.includes(s.work_date)).length} shifts
                </td>
                <td style={numCell}>
                  <span style={{ color: '#f97316' }}>CHF {totals.payroll.toFixed(2)}</span>
                </td>
                <td style={numCell}>{totals.prevision > 0 ? `CHF ${totals.prevision.toFixed(0)}` : '—'}</td>
                <td style={numCell}>{totals.reel > 0 ? `CHF ${totals.reel.toFixed(0)}` : '—'}</td>
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
