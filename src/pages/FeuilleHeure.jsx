import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const DAY_NAMES = ['dim','lun','mar','mer','jeu','ven','sam']
const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

function toMin(iso) {
  if (!iso) return 0
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
function diffMin(inIso, outIso) {
  if (!inIso || !outIso) return 0
  return Math.round((new Date(outIso) - new Date(inIso)) / 60000)
}
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtDur(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2,'0')}`
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export default function FeuilleHeure({ site, siteId, employees, fmtDate }) {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth())
  const [empId, setEmpId]     = useState(employees[0]?.id || null)
  const [clockings, setClockings] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded]   = useState(false)

  const employee = employees.find(e => e.id === empId)

  async function load() {
    if (!siteId || !empId) return
    setLoading(true)
    const from = `${year}-${String(month+1).padStart(2,'0')}-01`
    const lastDay = daysInMonth(year, month)
    const to   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const { data, error } = await supabase
      .from('clockings')
      .select('*')
      .eq('site_id', siteId)
      .eq('employee_id', empId)
      .gte('work_date', from)
      .lte('work_date', to)
      .eq('validated', true)
      .order('clock_in', { ascending: true })
    if (!error) setClockings(data || [])
    setLoading(false)
    setLoaded(true)
  }

  // Group clockings by date
  const byDate = useMemo(() => {
    const map = {}
    for (const c of clockings) {
      if (!map[c.work_date]) map[c.work_date] = []
      map[c.work_date].push(c)
    }
    return map
  }, [clockings])

  const totalMin = useMemo(() =>
    clockings.reduce((acc, c) => acc + (c.duration_min || diffMin(c.clock_in, c.clock_out)), 0),
    [clockings]
  )
  const workedDays = Object.keys(byDate).length

  // Build all days of month
  const days = useMemo(() => {
    const count = daysInMonth(year, month)
    return Array.from({ length: count }, (_, i) => {
      const d = i + 1
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const dow = new Date(year, month, d).getDay()
      return { d, dateStr, dow, isWeekend: dow === 0 || dow === 6, periods: byDate[dateStr] || [] }
    })
  }, [year, month, byDate])

  const monthLabel = `${MONTH_NAMES[month]} ${year}`

  // Month nav
  function prevMonth() {
    if (month === 0) { setYear(y => y-1); setMonth(11) }
    else setMonth(m => m-1)
    setLoaded(false); setClockings([])
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y+1); setMonth(0) }
    else setMonth(m => m+1)
    setLoaded(false); setClockings([])
  }

  const s = {
    wrap: { flex:1, overflow:'auto', padding:'20px 24px' },
    topRow: { display:'flex', alignItems:'center', gap:16, marginBottom:20, flexWrap:'wrap' },
    title: { fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:18, color:'var(--fg)' },
    sub: { fontSize:12, color:'var(--fg2)', marginTop:2 },
    spacer: { flex:1 },
    btn: { background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--fg2)', padding:'7px 12px', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:"'DM Sans',sans-serif" },
    btnPrimary: { background:'var(--accent)', border:'none', color:'white', padding:'7px 16px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" },
    select: { background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--fg)', padding:'7px 12px', borderRadius:8, fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer' },
    card: { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:16 },
    empGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 },
    empField: (i) => ({ padding:'12px 18px', borderRight: i%2===1 ? 'none' : '1px solid var(--border)', borderBottom: i>=2 ? 'none' : '1px solid var(--border)' }),
    label: { fontSize:10, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--fg3)', marginBottom:3 },
    value: { fontSize:14, fontWeight:600, color:'var(--fg)' },
    valueAccent: { fontSize:14, fontWeight:600, color:'var(--accent)', fontFamily:"'DM Mono',monospace" },
    stats: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 },
    statCard: { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px' },
    statVal: (color) => ({ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:22, color: color || 'var(--fg)', fontVariantNumeric:'tabular-nums' }),
    statLbl: { fontSize:11, color:'var(--fg2)', marginTop:2 },
    tableWrap: { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:16 },
    tableHead: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom:'1px solid var(--border)' },
    tableTitle: { fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em' },
    th: { padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--fg3)', background:'var(--bg3)', borderBottom:'1px solid var(--border)' },
    thR: { padding:'8px 12px', textAlign:'right', fontSize:10, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--fg3)', background:'var(--bg3)', borderBottom:'1px solid var(--border)' },
    sigBox: { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:20, maxWidth:400 },
    sigArea: { height:72, border:'1.5px dashed var(--border2,#ccc)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--fg3)', fontSize:13, marginBottom:8 },
  }

  const weeklyH = employee?.contract_pct ? (42 * employee.contract_pct / 100) : null
  const monthlyH = weeklyH ? (weeklyH * 4.33) : null
  const ecart = monthlyH ? (totalMin/60 - monthlyH) : null

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.topRow}>
        <div>
          <div style={s.title}>Feuilles d'heures — {site?.name}</div>
          <div style={s.sub}>Pointages validés par mois et par employé</div>
        </div>
        <div style={s.spacer} />

        {/* Employee selector */}
        <select value={empId || ''} onChange={e => { setEmpId(e.target.value); setLoaded(false); setClockings([]) }} style={s.select}>
          {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>

        {/* Month nav */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={prevMonth} style={s.btn}>‹</button>
          <span style={{ fontSize:13, fontWeight:600, minWidth:130, textAlign:'center', color:'var(--fg)' }}>
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          </span>
          <button onClick={nextMonth} style={s.btn}>›</button>
        </div>

        <button onClick={load} disabled={loading} style={s.btnPrimary}>
          {loading ? '…' : '↻ Charger'}
        </button>
      </div>

      {/* Employee card */}
      {employee && (
        <div style={s.card}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)' }}>
            {[
              { l: 'Employé',               v: `${employee.first_name} ${employee.last_name}`, accent: false },
              { l: 'Rôle',                  v: employee.role || '—', accent: false },
              { l: 'Taux d\'occupation',    v: employee.contract_pct ? `${employee.contract_pct}%` : '—', accent: true },
              { l: 'Temps hebdo contractuel', v: weeklyH ? `${weeklyH.toFixed(2)} h` : '—', accent: true },
            ].map((f, i) => (
              <div key={i} style={{ padding:'12px 18px', borderRight: i<3 ? '1px solid var(--border)' : 'none' }}>
                <div style={s.label}>{f.l}</div>
                <div style={f.accent ? s.valueAccent : s.value}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loaded && (
        <>
          {/* Stats */}
          <div style={s.stats}>
            <div style={s.statCard}>
              <div style={s.statVal('#15803d')}>{fmtDur(totalMin)}</div>
              <div style={s.statLbl}>Heures effectives</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statVal('var(--fg2)')}>0h00</div>
              <div style={s.statLbl}>Heures absences</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statVal(ecart == null ? 'var(--fg2)' : ecart >= 0 ? '#15803d' : '#b45309')}>
                {ecart == null ? '—' : (ecart >= 0 ? '+' : '') + fmtDur(Math.abs(Math.round(ecart * 60)))}
              </div>
              <div style={s.statLbl}>Écart vs. contractuel</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statVal('var(--accent)')}>{workedDays}</div>
              <div style={s.statLbl}>Jours travaillés</div>
            </div>
          </div>

          {/* Table */}
          <div style={s.tableWrap}>
            <div style={s.tableHead}>
              <span style={s.tableTitle}>Détail journalier — {monthLabel}</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead>
                  <tr>
                    {['Date','Périodes travaillées','Pause','Absences','Durée'].map((h,i) => (
                      <th key={i} style={i===4 ? s.thR : s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map(({ d, dateStr, dow, isWeekend, periods }) => {
                    const dayMin = periods.reduce((acc, c) => acc + (c.duration_min || diffMin(c.clock_in, c.clock_out)), 0)
                    const bg = isWeekend && !periods.length ? 'var(--bg3)' : 'transparent'
                    return (
                      <tr key={dateStr} style={{ borderBottom:'1px solid var(--border)', background:bg, opacity: isWeekend && !periods.length ? 0.7 : 1 }}>
                        <td style={{ padding:'8px 12px', minWidth:110 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:500, minWidth:22 }}>{String(d).padStart(2,'0')}</span>
                            <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color: isWeekend ? '#b45309' : 'var(--fg3)', minWidth:24 }}>{DAY_NAMES[dow]}</span>
                          </div>
                        </td>
                        <td style={{ padding:'8px 12px' }}>
                          {periods.length > 0
                            ? <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                {periods.map(c => (
                                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--fg2)' }}>
                                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#15803d', flexShrink:0 }} />
                                    <span>{fmtTime(c.clock_in)}</span>
                                    <span style={{ color:'var(--fg3)', fontSize:10 }}>→</span>
                                    <span>{fmtTime(c.clock_out)}</span>
                                  </div>
                                ))}
                              </div>
                            : <span style={{ color:'var(--fg3)', fontSize:12 }}>—</span>
                          }
                        </td>
                        <td style={{ padding:'8px 12px', color:'var(--fg3)', fontFamily:"'DM Mono',monospace", fontSize:12 }}>—</td>
                        <td style={{ padding:'8px 12px', color:'var(--fg3)', fontSize:12 }}>—</td>
                        <td style={{ padding:'8px 12px', textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight: dayMin ? 600 : 400, color: dayMin ? 'var(--fg)' : 'var(--fg3)' }}>
                          {dayMin ? fmtDur(dayMin) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr style={{ borderTop:'2px solid var(--border)', background:'var(--bg3)' }}>
                    <td colSpan={4} style={{ padding:'12px 12px', fontWeight:700, fontSize:13 }}>
                      Total {monthLabel}
                    </td>
                    <td style={{ padding:'12px 12px', textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:16, fontWeight:700, color:'var(--accent)' }}>
                      {fmtDur(totalMin)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Signature */}
          <div style={s.sigBox}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--fg3)', marginBottom:10 }}>
              Signature de l'employé
            </div>
            <div style={s.sigArea}>✍ Signer ici</div>
            <div style={{ fontSize:11, color:'var(--fg2)' }}>Date : ___________________</div>
          </div>
        </>
      )}

      {!loaded && !loading && (
        <div style={{ textAlign:'center', padding:60, color:'var(--fg2)', fontSize:14 }}>
          Sélectionnez un employé et un mois, puis cliquez sur <strong>Charger</strong>
        </div>
      )}
    </div>
  )
}
