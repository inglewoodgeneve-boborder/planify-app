import { useState, useEffect, useCallback } from 'react'
import { supabase, getSites, getEmployees, getShiftDefs, getShiftsForWeek,
         upsertShift, deleteShift, getTemplates, saveTemplate,
         getClockingsForDate, clockIn, clockOut,
         createEmployee, deleteEmployee, createShiftDef, deleteShiftDef, deleteTemplate,
         subscribeToShifts, subscribeToClockings } from './lib/supabase'
import Planning from './pages/Planning'
import Pointage from './pages/Pointage'
import Rapports from './pages/Rapports'
import Config   from './pages/Config'
import PlansDesTravail from './pages/PlansDesTravail'

const NAV = [
  { id: 'planning',   label: 'Planning',    icon: '▦' },
  { id: 'pointage',   label: 'Pointage',    icon: '⏱' },
  { id: 'absences',   label: 'Absences',    icon: '🗓' },
  { id: 'vacances',   label: 'Vacances',    icon: '✈' },
  { id: 'feuilles',   label: 'Feuilles h.', icon: '📄' },
  { id: 'config',     label: 'Config',      icon: '⚙️' },
  { id: 'plans',     label: 'Plans',       icon: '📋' },
  { id: 'rapports',   label: 'Rapports',    icon: '📊' },
]

export default function App() {
  const [view, setView]             = useState('planning')
  const [sidebarOpen, setSidebar]   = useState(true)
  const [sites, setSites]           = useState([])
  const [siteId, setSiteId]         = useState(null)
  const [employees, setEmployees]   = useState([])
  const [shiftDefs, setShiftDefs]   = useState([])
  const [shifts, setShifts]         = useState([])
  const [templates, setTemplates]   = useState([])
  const [clockings, setClockings]   = useState([])
  const [weekOffset, setWeekOffset] = useState(0)
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
  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), type === 'pin' ? 12000 : 3500)
  }, [])

  useEffect(() => {
    getSites().then(data => {
      setSites(data)
      if (data.length > 0) setSiteId(data[0].id)
      else setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    const dates = weekDates(weekOffset)
    const from  = fmtDate(dates[0])
    const to    = fmtDate(dates[6])
    const today = fmtDate(new Date())
    Promise.all([
      getEmployees(siteId),
      getShiftDefs(siteId),
      getShiftsForWeek(siteId, from, to),
      getTemplates(siteId),
      getClockingsForDate(siteId, today),
    ]).then(([emps, defs, sh, tpls, clk]) => {
      setEmployees(emps); setShiftDefs(defs); setShifts(sh)
      setTemplates(tpls); setClockings(clk); setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [siteId, weekOffset])

  useEffect(() => {
    if (!siteId) return
    const sub1 = subscribeToShifts(siteId, () => {
      const dates = weekDates(weekOffset)
      getShiftsForWeek(siteId, fmtDate(dates[0]), fmtDate(dates[6])).then(setShifts).catch(console.error)
    })
    const sub2 = subscribeToClockings(siteId, () => {
      getClockingsForDate(siteId, fmtDate(new Date())).then(setClockings).catch(console.error)
    })
    return () => { supabase.removeChannel(sub1); supabase.removeChannel(sub2) }
  }, [siteId, weekOffset])

  const handleDropShift = useCallback(async ({ employeeId, workDate, shiftDefId, startTime, endTime }) => {
    try {
      const payload = {
        employee_id: employeeId, site_id: siteId, shift_def_id: shiftDefId || null,
        work_date: workDate, start_time: startTime || null, end_time: endTime || null, status: 'draft',
      }
      const saved = await upsertShift(payload)
      setShifts(prev => [...prev, { ...saved, employees: employees.find(e => e.id === employeeId), shift_defs: shiftDefs.find(d => d.id === shiftDefId) }])
      showToast('Shift ajouté ✓')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, employees, shiftDefs, showToast])

  const handleDeleteShift = useCallback(async (id) => {
    try { await deleteShift(id); setShifts(prev => prev.filter(s => s.id !== id)); showToast('Shift supprimé') }
    catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

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
      setClockings(prev => [...prev, { ...rec, employees: employees.find(e => e.id === employeeId) }])
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

  const handleCreateEmployee = useCallback(async (data) => {
    try {
      const emp = await createEmployee({ ...data, site_id: siteId, active: true })
      setEmployees(prev => [...prev, emp])
      showToast(`${emp.first_name} ${emp.last_name} ajouté — PIN kiosque : ${emp._plainPin}`, 'pin')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, showToast])

  const handleDeleteEmployee = useCallback(async (id) => {
    try {
      await deleteEmployee(id)
      setEmployees(prev => prev.filter(e => e.id !== id))
      showToast('Employé supprimé')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

  const handleResetPin = useCallback(async (empId) => {
    try {
      const pin = String(Math.floor(1000 + Math.random() * 9000))
      const pin_hash = btoa('planify:' + pin)
      const { error } = await supabase.from('employees').update({ pin_hash }).eq('id', empId)
      if (error) throw error
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, pin_hash } : e))
      const emp = employees.find(e => e.id === empId)
      showToast(`🔑 Nouveau PIN pour ${emp?.first_name || ''} : ${pin}`, 'pin')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [employees, showToast])

  const handleCreateShiftDef = useCallback(async (data) => {
    try {
      const def = await createShiftDef({ ...data, site_id: siteId, sort_order: shiftDefs.length })
      setShiftDefs(prev => [...prev, def])
      showToast(`Type "${def.label}" créé ✓`)
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [siteId, shiftDefs, showToast])

  const handleDeleteShiftDef = useCallback(async (id) => {
    try {
      await deleteShiftDef(id)
      setShiftDefs(prev => prev.filter(d => d.id !== id))
      showToast('Type supprimé')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

  const handleDeleteTemplate = useCallback(async (id) => {
    try {
      await deleteTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      showToast('Plan supprimé')
    } catch (err) { showToast('Erreur : ' + err.message, 'error') }
  }, [showToast])

  const site = sites.find(s => s.id === siteId)
  const W = sidebarOpen ? 220 : 64

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden' }}>

      <aside style={{ width: W, minWidth: W, transition: 'width .2s, min-width .2s', background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 30, overflow: 'hidden' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', gap: 10, flexShrink: 0 }}>
          {sidebarOpen && (
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--accent)', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              planify<span style={{ color: '#f59e0b' }}>.</span>ch
            </div>
          )}
          <button onClick={() => setSidebar(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg2)', cursor: 'pointer', fontSize: 18, padding: 4, borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        {sidebarOpen && (
          <div style={{ padding: '12px 12px 8px' }}>
            <select value={siteId || ''} onChange={e => setSiteId(e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '7px 10px', borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', outline: 'none' }}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ id, label, icon }) => {
            const active = view === id
            return (
              <button key={id} onClick={() => setView(id)} title={!sidebarOpen ? label : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: sidebarOpen ? '9px 12px' : '9px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'none', color: active ? 'var(--accent)' : 'var(--fg2)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: active ? 600 : 400, transition: 'background .15s, color .15s', whiteSpace: 'nowrap', width: '100%' }}>
                <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                {sidebarOpen && label}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '8px 8px', borderTop: '1px solid var(--border)' }}>
          {sidebarOpen && siteId && (
            <a
              href={`/kiosk?site=${siteId}&name=${encodeURIComponent(site?.name || '')}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, color: 'var(--fg2)', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginBottom: 6, border: '1px solid var(--border)', background: 'var(--bg3)' }}>
              <span>📲</span> Ouvrir le kiosque
            </a>
          )}
          <button onClick={() => document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'}
            style={{ width: '100%', background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            🌗{sidebarOpen && <span style={{ fontSize: 12 }}>Thème</span>}
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{ height: 56, background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)', fontFamily: "'DM Sans', sans-serif" }}>
            {NAV.find(n => n.id === view)?.label}
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
                  onDropShift={handleDropShift} onDeleteShift={handleDeleteShift}
                  onSaveTemplate={handleSaveTemplate}
                  weekDates={weekDates} fmtDate={fmtDate} />
              )}
              {view === 'pointage' && (
                <Pointage site={site} employees={employees} shifts={shifts}
                  clockings={clockings}
                  onClockIn={handleClockIn} onClockOut={handleClockOut}
                  onRefresh={() => getClockingsForDate(siteId, fmtDate(new Date())).then(setClockings).catch(console.error)}
                  fmtDate={fmtDate} />
              )}
              {view === 'rapports' && (
                <Rapports site={site} employees={employees} shifts={shifts}
                  clockings={clockings} weekDates={weekDates}
                  weekOffset={weekOffset} fmtDate={fmtDate} />
              )}
              {view === 'config' && (
                <Config site={site} employees={employees} shiftDefs={shiftDefs}
                  onCreateEmployee={handleCreateEmployee} onDeleteEmployee={handleDeleteEmployee}
                  onCreateShiftDef={handleCreateShiftDef} onDeleteShiftDef={handleDeleteShiftDef}
                  onResetPin={handleResetPin} />
              )}
              {view === 'plans' && (
                <PlansDesTravail site={site} templates={templates}
                  onDeleteTemplate={handleDeleteTemplate} />
              )}
              {(view === 'absences' || view === 'vacances' || view === 'feuilles') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: 'var(--fg2)' }}>
                  <span style={{ fontSize: 36 }}>{NAV.find(n => n.id === view)?.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{NAV.find(n => n.id === view)?.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>En cours de développement</span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: toast.type === 'error' ? '#7f1d1d' : toast.type === 'pin' ? '#1e3a5f' : '#14532d', color: 'white', padding: toast.type === 'pin' ? '14px 22px' : '11px 20px', borderRadius: 10, fontWeight: 600, fontSize: toast.type === 'pin' ? 15 : 13, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'fadeIn .2s ease', maxWidth: 320 }}>
          {toast.type === 'pin' ? <span>🔑 {toast.msg}</span> : toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
