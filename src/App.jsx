import { useState, useEffect, useCallback } from 'react'
import { supabase, getSites, getEmployees, getShiftDefs, getShiftsForWeek,
         upsertShift, deleteShift, getTemplates, saveTemplate,
         getClockingsForDate, clockIn, clockOut,
         subscribeToShifts, subscribeToClockings } from './lib/supabase'
import Planning from './pages/Planning'
import Pointage from './pages/Pointage'
import Rapports from './pages/Rapports'
import Config from './pages/Config'

// NAV : items plats ou avec children pour groupe déroulant
const NAV = [
  { id: 'planning',  label: 'Planning',           icon: '▦' },
  { id: 'temps',     label: 'Temps des employés', icon: '⏱', children: [
    { id: 'pointage', label: 'Pointage',           icon: '🕐' },
    { id: 'feuilles', label: "Feuilles d'heure",   icon: '📄' },
  ]},
  { id: 'absences',  label: 'Absences',            icon: '🗓' },
  { id: 'vacances',  label: 'Vacances',            icon: '✈' },
  { id: 'rapports',  label: 'Rapports',            icon: '📊' },
  { id: 'config',    label: 'Config',              icon: '⚙' },
]

function flatNav(nav) {
  return nav.flatMap(n => n.children ? [n, ...n.children] : [n])
}

export default function App() {
  const [view, setView]             = useState('planning')
  const [sidebarOpen, setSidebar]   = useState(true)
  const [tempsOpen, setTempsOpen]   = useState(false)
  const [sites, setSites]           = useState([])
  const [siteId, setSiteId]         = useState(null)
  const [employees, setEmployees]   = useState([])
  const [shiftDefs, setShiftDefs]   = useState([])
  const [positions, setPositions]   = useState([])
  const [shifts, setShifts]         = useState([])
  const [templates, setTemplates]   = useState([])
  const [clockings, setClockings]   = useState([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewMode, setViewMode]       = useState('week') // 'week' | 'month'
  const [monthYear, setMonthYear]     = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)

  function getMonday(offset = 0) {
    const d = new Date()
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7)
    d.setHours(0, 0, 0, 0)
    return d
  }
  function weekDates(offset = 0) {
    const mon = getMonday(offset)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d
    })
  }
  // Returns array of 7-date arrays for all weeks touching the given month
  function monthWeekDates(year, month) {
    // First Monday on or before the 1st of month
    const firstDay = new Date(year, month, 1)
    const dow = firstDay.getDay() // 0=Sun
    const offset = dow === 0 ? -6 : 1 - dow
    const start = new Date(year, month, 1 + offset)
    // Last Sunday on or after the last day of month
    const lastDay = new Date(year, month + 1, 0)
    const lastDow = lastDay.getDay()
    const endOffset = lastDow === 0 ? 0 : 7 - lastDow
    const end = new Date(year, month + 1, 0 + endOffset)
    const weeks = []
    const cur = new Date(start)
    while (cur <= end) {
      const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(cur); d.setDate(cur.getDate() + i); return d })
      weeks.push(week)
      cur.setDate(cur.getDate() + 7)
    }
    return weeks
  }

  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    getSites().then(data => {
      setSites(data)
      if (data.length > 0) {
        setSiteId(data[0].id)
      } else {
        setLoading(false)
      }
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    let from, to
    if (viewMode === 'month') {
      const weeks = monthWeekDates(monthYear.year, monthYear.month)
      from = fmtDate(weeks[0][0])
      to   = fmtDate(weeks[weeks.length - 1][6])
    } else {
      const dates = weekDates(weekOffset)
      from = fmtDate(dates[0])
      to   = fmtDate(dates[6])
    }
    const today = fmtDate(new Date())
    Promise.all([
      getEmployees(siteId),
      getShiftDefs(siteId),
      supabase.from('positions').select('*').eq('site_id', siteId).order('created_at').then(r => r.data || []),
      getShiftsForWeek(siteId, from, to),
      getTemplates(siteId),
      getClockingsForDate(siteId, today),
    ]).then(([emps, defs, pos, sh, tpls, clk]) => {
      setEmployees(emps); setShiftDefs(defs); setPositions(pos)
      setShifts(sh); setTemplates(tpls); setClockings(clk); setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [siteId, weekOffset, viewMode, monthYear])

  useEffect(() => {
    if (!siteId) return
    const sub1 = subscribeToShifts(siteId, () => {
      let from, to
      if (viewMode === 'month') {
        const weeks = monthWeekDates(monthYear.year, monthYear.month)
        from = fmtDate(weeks[0][0]); to = fmtDate(weeks[weeks.length - 1][6])
      } else {
        const dates = weekDates(weekOffset)
        from = fmtDate(dates[0]); to = fmtDate(dates[6])
      }
      getShiftsForWeek(siteId, from, to).then(setShifts).catch(console.error)
    })
    const sub2 = subscribeToClockings(siteId, () => {
      getClockingsForDate(siteId, fmtDate(new Date())).then(setClockings).catch(console.error)
    })
    return () => { supabase.removeChannel(sub1); supabase.removeChannel(sub2) }
  }, [siteId, weekOffset])

  const handleDropShift = useCallback(async ({ employeeId, workDate, shiftDefId, startTime, endTime, existingId }) => {
    try {
      const payload = {
        ...(existingId ? { id: existingId } : {}),
        employee_id: employeeId, site_id: siteId, shift_def_id: shiftDefId,
        work_date: workDate, start_time: startTime || null, end_time: endTime || null, status: 'draft',
      }
      const saved = await upsertShift(payload)
      setShifts(prev => {
        const filtered = prev.filter(s => !(s.employee_id === employeeId && s.work_date === workDate))
        return [...filtered, { ...saved, employees: employees.find(e => e.id === employeeId), shift_defs: shiftDefs.find(d => d.id === shiftDefId) }]
      })
      showToast('Shift ajouté ✓')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, employees, shiftDefs, showToast])

  const handleDeleteShift = useCallback(async (id) => {
    try { await deleteShift(id); setShifts(prev => prev.filter(s => s.id !== id)); showToast('Shift supprimé') }
    catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

  const handleRefreshShifts = useCallback(async () => {
    if (!siteId) return
    let from, to
    if (viewMode === 'month') {
      const weeks = monthWeekDates(monthYear.year, monthYear.month)
      from = fmtDate(weeks[0][0]); to = fmtDate(weeks[weeks.length - 1][6])
    } else {
      const dates = weekDates(weekOffset)
      from = fmtDate(dates[0]); to = fmtDate(dates[6])
    }
    const sh = await getShiftsForWeek(siteId, from, to)
    setShifts(sh)
  }, [siteId, weekOffset, viewMode, monthYear])

  const handleSaveTemplate = useCallback(async (name, slotsArray) => {
    try {
      await saveTemplate(siteId, name, slotsArray)
      const tpls = await getTemplates(siteId)
      setTemplates(tpls); showToast(`Plan "${name}" sauvegardé ✓`)
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, showToast])

  const handleClockIn = useCallback(async (employeeId) => {
    try {
      const rec = await clockIn(employeeId, siteId, fmtDate(new Date()))
      setClockings(prev => [...prev.filter(c => c.employee_id !== employeeId), { ...rec, employees: employees.find(e => e.id === employeeId) }])
      showToast('Entrée enregistrée ✓')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, employees, showToast])

  const handleClockOut = useCallback(async (clockingId) => {
    try {
      const rec = await clockOut(clockingId)
      setClockings(prev => prev.map(c => c.id === clockingId ? { ...c, ...rec } : c))
      showToast('Sortie enregistrée ✓')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

  function navigateTo(id) {
    const inTemps = NAV.find(n => n.id === 'temps')?.children?.some(c => c.id === id)
    if (inTemps) setTempsOpen(true)
    setView(id)
  }

  const allNav = flatNav(NAV)
  const currentItem = allNav.find(n => n.id === view)
  const site = sites.find(s => s.id === siteId)
  const W = sidebarOpen ? 220 : 64

  function navBtnStyle(active) {
    return {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: sidebarOpen ? '9px 12px' : '9px 0',
      justifyContent: sidebarOpen ? 'flex-start' : 'center',
      borderRadius: 8, border: 'none', cursor: 'pointer',
      background: active ? 'var(--accent-dim)' : 'none',
      color: active ? 'var(--accent)' : 'var(--fg2)',
      fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
      transition: 'background .15s, color .15s', whiteSpace: 'nowrap', width: '100%',
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden' }}>

      <aside style={{
        width: W, minWidth: W, transition: 'width .2s, min-width .2s',
        background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', zIndex: 30, overflow: 'hidden',
      }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', gap: 10, flexShrink: 0 }}>
          {sidebarOpen && (
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--accent)', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              planify<span style={{ color: '#f59e0b' }}>.</span>ch
            </div>
          )}
          <button onClick={() => setSidebar(o => !o)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg2)',
            cursor: 'pointer', fontSize: 18, padding: 4, borderRadius: 6, lineHeight: 1, flexShrink: 0,
          }}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        {sidebarOpen && (
          <div style={{ padding: '12px 12px 8px' }}>
            <select value={siteId || ''} onChange={e => setSiteId(e.target.value)} style={{
              width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
              color: 'var(--fg)', padding: '7px 10px', borderRadius: 8, fontSize: 12,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', outline: 'none',
            }}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV.map((item) => {
            if (!item.children) {
              const active = view === item.id
              return (
                <button key={item.id} onClick={() => navigateTo(item.id)}
                  title={!sidebarOpen ? item.label : undefined}
                  style={navBtnStyle(active)}>
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {sidebarOpen && item.label}
                </button>
              )
            }

            const groupActive = item.children.some(c => c.id === view)
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (sidebarOpen) {
                      setTempsOpen(o => !o)
                    } else {
                      navigateTo(item.children[0].id)
                    }
                  }}
                  title={!sidebarOpen ? item.label : undefined}
                  style={{ ...navBtnStyle(groupActive && !tempsOpen), justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    {sidebarOpen && item.label}
                  </span>
                  {sidebarOpen && (
                    <span style={{ fontSize: 11, opacity: 0.5, transition: 'transform .2s', display: 'inline-block', transform: tempsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      ▶
                    </span>
                  )}
                </button>

                {sidebarOpen && tempsOpen && (
                  <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {item.children.map(child => {
                      const active = view === child.id
                      return (
                        <button key={child.id} onClick={() => navigateTo(child.id)}
                          style={{ ...navBtnStyle(active), paddingLeft: 10 }}>
                          <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{child.icon}</span>
                          {child.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div style={{ padding: '8px 8px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'}
            style={{
              width: '100%', background: 'none', border: '1px solid var(--border)',
              color: 'var(--fg2)', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            🌗{sidebarOpen && <span style={{ fontSize: 12 }}>Thème</span>}
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{
          height: 56, background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)', fontFamily: "'DM Sans', sans-serif" }}>
            {currentItem?.label}
          </h1>
          {site && (
            <span style={{ fontSize: 12, color: 'var(--fg2)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)' }}>
              {site.name}
            </span>
          )}
        </header>

        <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg2)', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Chargement…</span>
            </div>
          ) : (
            <>
              {view === 'planning' && (
                <Planning site={site} employees={employees} shiftDefs={shiftDefs}
                  shifts={shifts} templates={templates}
                  weekOffset={weekOffset} setWeekOffset={setWeekOffset}
                  viewMode={viewMode} setViewMode={setViewMode}
                  monthYear={monthYear} setMonthYear={setMonthYear}
                  monthWeekDates={monthWeekDates}
                  onDropShift={handleDropShift} onDeleteShift={handleDeleteShift}
                  onSaveTemplate={handleSaveTemplate}
                  onRefreshShifts={handleRefreshShifts}
                  weekDates={weekDates} fmtDate={fmtDate} />
              )}
              {view === 'pointage' && (
                <Pointage site={site} employees={employees} shifts={shifts}
                  clockings={clockings}
                  onClockIn={handleClockIn} onClockOut={handleClockOut}
                  fmtDate={fmtDate} />
              )}
              {view === 'rapports' && (
                <Rapports site={site} employees={employees} shifts={shifts}
                  clockings={clockings} weekDates={weekDates}
                  weekOffset={weekOffset} fmtDate={fmtDate} />
              )}
              {view === 'config' && (
                <Config site={site} siteId={siteId} employees={employees} shiftDefs={shiftDefs} positions={positions}
                  onCreateEmployee={async (data) => {
                    const { data: e } = await supabase.from('employees').insert({ ...data, site_id: siteId }).select().single()
                    if (e) setEmployees(prev => [...prev, e])
                  }}
                  onUpdateEmployee={async (id, data) => {
                    const { data: e } = await supabase.from('employees').update(data).eq('id', id).select().single()
                    if (e) setEmployees(prev => prev.map(x => x.id === id ? e : x))
                  }}
                  onDeleteEmployee={async (id) => {
                    if (!confirm('Supprimer cet employé ?')) return
                    await supabase.from('employees').delete().eq('id', id)
                    setEmployees(prev => prev.filter(x => x.id !== id))
                  }}
                  onCreateShiftDef={async (data) => {
                    const { data: d } = await supabase.from('shift_defs').insert({ ...data, site_id: siteId }).select().single()
                    if (d) setShiftDefs(prev => [...prev, d])
                  }}
                  onDeleteShiftDef={async (id) => {
                    if (!confirm('Supprimer ce type de shift ?')) return
                    await supabase.from('shift_defs').delete().eq('id', id)
                    setShiftDefs(prev => prev.filter(x => x.id !== id))
                  }}
                  onCreatePosition={async (data) => {
                    const { data: p, error: pe } = await supabase.from('positions').insert({ ...data, site_id: siteId }).select().single()
                    console.log('CREATE POSITION', { data, siteId, p, pe })
                    if (p) setPositions(prev => [...prev, p])
                  }}
                  onDeletePosition={async (id) => {
                    await supabase.from('positions').delete().eq('id', id)
                    setPositions(prev => prev.filter(p => p.id !== id))
                  }}
                  onRefresh={() => {
                    getEmployees(siteId).then(setEmployees)
                    getShiftDefs(siteId).then(setShiftDefs)
                    supabase.from('positions').select('*').eq('site_id', siteId).order('created_at').then(r => setPositions(r.data || []))
                  }} />
              )}
              {(view === 'absences' || view === 'vacances' || view === 'feuilles') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: 'var(--fg2)' }}>
                  <span style={{ fontSize: 36 }}>{currentItem?.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{currentItem?.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>En cours de développement</span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: toast.type === 'error' ? '#7f1d1d' : '#14532d',
          color: 'white', padding: '11px 20px', borderRadius: 10,
          fontWeight: 600, fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'fadeIn .2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
