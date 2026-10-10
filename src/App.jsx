import { useState, useEffect, useCallback } from 'react'
import { supabase, getSites, getEmployees, getShiftDefs, getShiftsForWeek,
         upsertShift, deleteShift, getTemplates, saveTemplate,
         getClockingsForDate, clockIn, clockOut,
         subscribeToShifts, subscribeToClockings } from './lib/supabase'
import { checkShift, checkWeek, weeklyHours, shiftDuration, isHoliday, isSunday } from './lib/lgav'
import Planning from './pages/Planning'
import Pointage from './pages/Pointage'
import Rapports from './pages/Rapports'

export default function App() {
  const [view, setView]           = useState('planning')
  const [sites, setSites]         = useState([])
  const [siteId, setSiteId]       = useState(null)
  const [employees, setEmployees] = useState([])
  const [shiftDefs, setShiftDefs] = useState([])
  const [shifts, setShifts]       = useState([])
  const [templates, setTemplates] = useState([])
  const [clockings, setClockings] = useState([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)

  // ── Date helpers ───────────────────────────────────────────
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

  // ── Toast ──────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Load sites ─────────────────────────────────────────────
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

  // ── Load site data when site or week changes ───────────────
  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    const dates  = weekDates(weekOffset)
    const from   = fmtDate(dates[0])
    const to     = fmtDate(dates[6])
    const today  = fmtDate(new Date())

    Promise.all([
      getEmployees(siteId),
      getShiftDefs(siteId),
      getShiftsForWeek(siteId, from, to),
      getTemplates(siteId),
      getClockingsForDate(siteId, today),
    ]).then(([emps, defs, sh, tpls, clk]) => {
      setEmployees(emps)
      setShiftDefs(defs)
      setShifts(sh)
      setTemplates(tpls)
      setClockings(clk)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [siteId, weekOffset])

  // ── Realtime subscriptions ─────────────────────────────────
  useEffect(() => {
    if (!siteId) return
    const sub1 = subscribeToShifts(siteId, () => {
      const dates = weekDates(weekOffset)
      getShiftsForWeek(siteId, fmtDate(dates[0]), fmtDate(dates[6]))
        .then(setShifts).catch(console.error)
    })
    const sub2 = subscribeToClockings(siteId, () => {
      getClockingsForDate(siteId, fmtDate(new Date()))
        .then(setClockings).catch(console.error)
    })
    return () => { supabase.removeChannel(sub1); supabase.removeChannel(sub2) }
  }, [siteId, weekOffset])

  // ── Shift actions ──────────────────────────────────────────
  const handleDropShift = useCallback(async ({ employeeId, workDate, shiftDefId, startTime, endTime, existingId }) => {
    try {
      const payload = {
        ...(existingId ? { id: existingId } : {}),
        employee_id:  employeeId,
        site_id:      siteId,
        shift_def_id: shiftDefId,
        work_date:    workDate,
        start_time:   startTime || null,
        end_time:     endTime   || null,
        status:       'draft',
      }
      const saved = await upsertShift(payload)
      setShifts(prev => {
        const filtered = prev.filter(s => !(s.employee_id === employeeId && s.work_date === workDate))
        return [...filtered, { ...saved, employees: employees.find(e => e.id === employeeId), shift_defs: shiftDefs.find(d => d.id === shiftDefId) }]
      })
      showToast('Shift ajouté ✓')
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error')
    }
  }, [siteId, employees, shiftDefs, showToast])

  const handleDeleteShift = useCallback(async (id) => {
    try {
      await deleteShift(id)
      setShifts(prev => prev.filter(s => s.id !== id))
      showToast('Shift supprimé')
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error')
    }
  }, [showToast])

  const handleSaveTemplate = useCallback(async (name, slotsArray) => {
    try {
      await saveTemplate(siteId, name, slotsArray)
      const tpls = await getTemplates(siteId)
      setTemplates(tpls)
      showToast(`Plan "${name}" sauvegardé ✓`)
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error')
    }
  }, [siteId, showToast])

  // ── Clock actions ──────────────────────────────────────────
  const handleClockIn = useCallback(async (employeeId) => {
    try {
      const rec = await clockIn(employeeId, siteId, fmtDate(new Date()))
      setClockings(prev => [...prev.filter(c => c.employee_id !== employeeId), { ...rec, employees: employees.find(e => e.id === employeeId) }])
      showToast('Pointage entrée enregistré ✓')
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error')
    }
  }, [siteId, employees, showToast])

  const handleClockOut = useCallback(async (clockingId) => {
    try {
      const rec = await clockOut(clockingId)
      setClockings(prev => prev.map(c => c.id === clockingId ? { ...c, ...rec } : c))
      showToast('Pointage sortie enregistré ✓')
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error')
    }
  }, [showToast])

  const site = sites.find(s => s.id === siteId)

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: 'var(--bg)', color: 'var(--fg)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0, zIndex: 20 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
          planify<span style={{ color: '#f59e0b' }}>.</span>ch
        </div>
        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[['planning','Planning'],['pointage','Pointage'],['rapports','Rapports']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: view === id ? 'var(--accent)' : 'var(--fg2)', background: view === id ? 'var(--accent-dim)' : 'none', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </nav>
        <select value={siteId || ''} onChange={e => setSiteId(e.target.value)}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', outline: 'none' }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12 }}>🌗</button>
      </header>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg2)' }}>
          Chargement…
        </div>
      ) : (
        <>
          {view === 'planning' && (
            <Planning
              site={site} employees={employees} shiftDefs={shiftDefs}
              shifts={shifts} templates={templates}
              weekOffset={weekOffset} setWeekOffset={setWeekOffset}
              onDropShift={handleDropShift} onDeleteShift={handleDeleteShift}
              onSaveTemplate={handleSaveTemplate}
              weekDates={weekDates} fmtDate={fmtDate}
            />
          )}
          {view === 'pointage' && (
            <Pointage
              site={site} employees={employees} shifts={shifts}
              clockings={clockings}
              onClockIn={handleClockIn} onClockOut={handleClockOut}
              fmtDate={fmtDate}
            />
          )}
          {view === 'rapports' && (
            <Rapports
              site={site} employees={employees} shifts={shifts}
              clockings={clockings} weekDates={weekDates}
              weekOffset={weekOffset} fmtDate={fmtDate}
            />
          )}
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 999, background: toast.type === 'error' ? '#7f1d1d' : '#14532d', color: 'white', padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
