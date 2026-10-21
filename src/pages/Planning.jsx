import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkShift, shiftDuration, isHoliday, isSunday } from '../lib/lgav'

const FR_DAYS   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const FR_MONTHS      = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
const FR_MONTHS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function Planning({ site, employees, shiftDefs, shifts, templates, weekOffset, setWeekOffset, viewMode, setViewMode, monthYear, setMonthYear, monthWeekDates, periods, activePeriod, setActivePeriod, onCreatePeriod, onDeletePeriod, onDropShift, onDeleteShift, onSaveTemplate, onRefreshShifts, weekDates, fmtDate, appLoading }) {
  const [dragSource, setDragSource]   = useState(null)
  const dragRef = useRef(null)
  const [dropTarget, setDropTarget]   = useState(null) // { key, side: 'left'|'right' } | null
  const [modal, setModal]             = useState(null)
  const [modalLabel, setModalLabel]   = useState('')
  const [modalStart, setModalStart]   = useState('08:00')
  const [modalEnd, setModalEnd]       = useState('16:00')

  // Palette import depuis template (ancienne logique conservée)
  const [importedPalette, setImportedPalette] = useState(null)

  // Sauver semaine comme plan de travail
  const [saveModal, setSaveModal]     = useState(false)
  const [saveName, setSaveName]       = useState('')

  // ── Nouveaux plans de travail (work_plans) ────────────────────

  // ── Plans de travail (pour création de période) ────────────────
  const [workPlans, setWorkPlans] = useState([])

  useEffect(() => {
    supabase.from('work_plans').select('*').order('created_at')
      .then(({ data }) => setWorkPlans(data || []))
  }, [])

  // ── Période modal ──────────────────────────────────────────────
  const [periodModal, setPeriodModal]   = useState(false)
  const [pName, setPName]               = useState('')
  const [pFrom, setPFrom]               = useState('')
  const [pTo, setPTo]                   = useState('')
  const [pWorkPlan, setPWorkPlan]        = useState('')

  const dates = weekDates(weekOffset)
  const today = fmtDate(new Date())

  // ── Helpers ────────────────────────────────────────────────────
  function getShifts(empId, dateStr) {
    return shifts.filter(s => s.employee_id === empId && s.work_date === dateStr)
  }
  function getEmpWeekHours(empId) {
    return shifts.filter(s => s.employee_id === empId)
      .reduce((acc, s) => acc + shiftDuration(s.start_time, s.end_time), 0)
  }
  function getWeekTotal() {
    return employees.reduce((a, e) => a + getEmpWeekHours(e.id), 0)
  }
  function getShiftCount() {
    return shifts.filter(s => {
      const d = new Date(s.work_date)
      return d >= dates[0] && d <= dates[6]
    }).length
  }
  function getUnassignedShifts(dateStr) {
    return shifts.filter(s => s.work_date === dateStr && !s.employee_id)
  }
  function getISOWeek(d) {
    const jan4 = new Date(d.getFullYear(), 0, 4)
    return Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7)
  }

  // ── Drag & Drop ────────────────────────────────────────────────
  function onPaletteDragStart(e, def) {
    const src = { type: 'palette', def }
    setDragSource(src); dragRef.current = src
    e.dataTransfer.setData('text/plain', def.id)
  }
  function onImportedDragStart(e, slot) {
    const def = shiftDefs.find(d => d.id === slot.shift_def_id)
    if (!def) return
    const src = { type: 'imported', def, slot }
    setDragSource(src); dragRef.current = src
    e.dataTransfer.setData('text/plain', def.id)
  }
  function onAssignedDragStart(e, shift) {
    const src = { type: 'assigned', shift }
    setDragSource(src); dragRef.current = src
    e.dataTransfer.setData('text/plain', shift.id)
  }
  function onCellDragOver(e, empId, dateStr) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right'
    const isCopy = dragRef.current?.type === 'assigned' && side === 'left'
    e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move'
    setDropTarget({ key: `${empId}_${dateStr}`, side })
  }
  function onCellDragLeave() { setDropTarget(null) }

  async function onCellDrop(e, empId, dateStr) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right'
    setDropTarget(null)
    const src = dragRef.current
    if (!src) return
    if (src.type === 'palette' || src.type === 'imported') {
      const def = src.def
      await onDropShift({ employeeId: empId, workDate: dateStr, shiftDefId: def.id, startTime: def.start_time, endTime: def.end_time })
      if (src.type === 'imported' && importedPalette) {
        setImportedPalette(prev => ({ ...prev, slots: prev.slots.filter(s => s.slotKey !== src.slot.slotKey) }))
      }
    } else if (src.type === 'assigned') {
      const s = src.shift
      if (s.employee_id === empId && s.work_date === dateStr) return
      const isCopy = side === 'left'
      if (!isCopy) await onDeleteShift(s.id) // move: remove original
      await onDropShift({ employeeId: empId, workDate: dateStr, shiftDefId: s.shift_def_id, startTime: s.start_time, endTime: s.end_time })
    }
    dragRef.current = null
    setDragSource(null)
  }

  async function onUnassignedDrop(e, dateStr) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right'
    setDropTarget(null)
    const src = dragRef.current
    if (!src) return
    if (src.type === 'assigned' && src.shift.employee_id) {
      const isCopy = side === 'left'
      if (!isCopy) await onDeleteShift(src.shift.id)
      await onDropShift({ employeeId: null, workDate: dateStr, shiftDefId: src.shift.shift_def_id, startTime: src.shift.start_time, endTime: src.shift.end_time })
    } else if (src.type === 'palette' || src.type === 'imported') {
      const def = src.def
      await onDropShift({ employeeId: null, workDate: dateStr, shiftDefId: def.id, startTime: def.start_time, endTime: def.end_time })
    }
    dragRef.current = null
    setDragSource(null)
  }

  // ── Modal ajout/édition shift ──────────────────────────────────
  function openModal(empId, date, existingShift = null) {
    if (existingShift) {
      const def = shiftDefs.find(d => d.id === existingShift.shift_def_id)
      setModal({ empId: existingShift.employee_id, date: existingShift.work_date, editId: existingShift.id })
      setModalLabel(def?.label || '')
      setModalStart(existingShift.start_time?.slice(0,5) || '08:00')
      setModalEnd(existingShift.end_time?.slice(0,5) || '16:00')
    } else {
      setModal({ empId, date })
      setModalLabel(''); setModalStart('08:00'); setModalEnd('16:00')
    }
  }
  function pickShiftDef(def) {
    setModalLabel(def.label)
    if (def.start_time) { setModalStart(def.start_time.slice(0,5)); setModalEnd(def.end_time.slice(0,5)) }
  }

  function timeToMins(t) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  function minsToTime(m) {
    const total = ((m % 1440) + 1440) % 1440
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
  }
  function handleModalStartChange(newStart) {
    const oldStartMins = timeToMins(modalStart)
    const oldEndMins   = timeToMins(modalEnd)
    const duration     = ((oldEndMins - oldStartMins) + 1440) % 1440
    const newStartMins = timeToMins(newStart)
    setModalStart(newStart)
    setModalEnd(minsToTime(newStartMins + duration))
  }
  async function confirmModal() {
    if (!modal || !modalLabel.trim()) return
    const matchedDef = shiftDefs.find(d => d.label === modalLabel.trim())
    await onDropShift({
      employeeId: modal.empId,
      workDate: modal.date,
      shiftDefId: matchedDef?.id || null,
      startTime: modalStart,
      endTime: modalEnd,
      existingId: modal.editId || null,
    })
    setModal(null)
  }

  // ── Import template dans palette (ancienne logique) ────────────
  function importTpl(tpl) {
    const slots = (tpl.week_template_slots || []).map((s, i) => ({ ...s, slotKey: `${s.day_index}_${s.shift_def_id}_${i}` }))
    setImportedPalette({ tplId: tpl.id, tplName: tpl.name, slots })
  }
  function clearImport() { setImportedPalette(null) }

  // ── Sauver semaine courante comme plan de travail ──────────────
  function openSaveModal() { setSaveName(''); setSaveModal(true) }
  async function confirmSave() {
    if (!saveName.trim()) return
    const slots = []
    dates.forEach((d, di) => {
      const ds = fmtDate(d)
      shifts.filter(s => s.work_date === ds).forEach(s => {
        if (s.shift_def_id) slots.push({ day_index: di, shift_def_id: s.shift_def_id })
      })
    })
    await onSaveTemplate(saveName.trim(), slots)
    setSaveModal(false)
  }

  // ── Générer une semaine depuis un work_plan ────────────────────
  const modalViolations = modal ? checkShift({ startTime: modalStart, endTime: modalEnd, workDate: modal.date }) : []

  const FR_MONTHS_FR = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

  async function confirmCreatePeriod() {
    if (!pName.trim() || !pFrom || !pTo) return
    const p = await onCreatePeriod({ name: pName.trim(), date_from: pFrom, date_to: pTo })
    if (!p) return

    // Apply work plan to all weeks in the period if selected
    if (pWorkPlan) {
      const plan = workPlans.find(wp => wp.id === pWorkPlan)
      if (plan) {
        const { data: planShifts } = await supabase.from('work_plan_shifts')
          .select('*, shift_defs(*)').eq('work_plan_id', plan.id).order('day_of_week')

        if (planShifts && planShifts.length > 0) {
          // Generate all weeks between date_from and date_to
          const start = new Date(pFrom + 'T00:00:00')
          const end   = new Date(pTo   + 'T00:00:00')
          // Get Monday of start week
          const startDay = start.getDay() // 0=Sun
          const mondayOffset = startDay === 0 ? -6 : 1 - startDay
          const firstMonday = new Date(start)
          firstMonday.setDate(firstMonday.getDate() + mondayOffset)

          const rows = []
          let weekStart = new Date(firstMonday)
          while (weekStart <= end) {
            for (const ps of planShifts) {
              const def = ps.shift_defs
              if (!def) continue
              const date = new Date(weekStart)
              date.setDate(date.getDate() + (ps.day_of_week || 0))
              if (date < start || date > end) continue
              const dateStr = date.toISOString().split('T')[0]
              for (let i = 0; i < (ps.quantity || 1); i++) {
                rows.push({
                  site_id: site?.id || null,
                  employee_id: null,
                  shift_def_id: def.id,
                  work_date: dateStr,
                  start_time: def.start_time || null,
                  end_time: def.end_time || null,
                  status: 'draft',
                })
              }
            }
            weekStart.setDate(weekStart.getDate() + 7)
          }

          if (rows.length > 0) {
            await supabase.from('shifts').insert(rows)
          }
        }
      }
    }

    setActivePeriod(p)
    setPeriodModal(false)
    // Shifts will be reloaded by the activePeriod useEffect in App.jsx
  }

  // ── Period home screen ─────────────────────────────────────────
  if (appLoading) return null
  if (!activePeriod) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22 }}>Planning</div>
              <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>Sélectionne une période pour commencer à planifier</div>
            </div>
            <button onClick={() => { setPName(''); setPFrom(''); setPTo(''); setPWorkPlan(''); setPeriodModal(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent)', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne',sans-serif" }}>
              + Nouvelle période
            </button>
          </div>
        </div>

        {/* Periods list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {periods.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16 }}>
              <div style={{ fontSize: 48, opacity: .3 }}>📅</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--fg2)' }}>Aucune période</div>
              <div style={{ fontSize: 13, color: 'var(--fg3)', textAlign: 'center', maxWidth: 320 }}>Crée ta première période de planning — par exemple "Novembre 2026" avec les dates du 27 oct au 30 nov.</div>
              <button onClick={() => { setPName(''); setPFrom(''); setPTo(''); setPWorkPlan(''); setPeriodModal(true) }}
                style={{ marginTop: 8, background: 'var(--accent)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Créer une période
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {periods.map(p => {
                const from = new Date(p.date_from + 'T00:00:00')
                const to   = new Date(p.date_to + 'T00:00:00')
                const days = Math.round((to - from) / 86400000) + 1
                return (
                  <div key={p.id}
                    onClick={() => setActivePeriod(p)}
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', cursor: 'pointer', transition: 'all .15s', position: 'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 5%, var(--bg2))' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 4 }}>
                      {from.getDate()} {FR_MONTHS_FR[from.getMonth()]} {from.getFullYear()} → {to.getDate()} {FR_MONTHS_FR[to.getMonth()]} {to.getFullYear()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{days} jours</div>
                    <button onClick={e => { e.stopPropagation(); onDeletePeriod(p.id) }}
                      style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Create period modal */}
        {periodModal && (
          <div onClick={e => e.target === e.currentTarget && setPeriodModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, minWidth: 360, maxWidth: 460, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 20 }}>Nouvelle période</div>
              <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom</label>
              <input autoFocus value={pName} onChange={e => setPName(e.target.value)}
                placeholder="Ex: Novembre 2026, Hiver S44–S48…"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '9px 12px', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Du</label>
                  <input type="date" value={pFrom} onChange={e => setPFrom(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '9px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Au</label>
                  <input type="date" value={pTo} onChange={e => setPTo(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '9px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              {workPlans.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                    Plan de travail à appliquer <span style={{ fontWeight: 400, color: 'var(--fg3)' }}>(optionnel)</span>
                  </label>
                  <select value={pWorkPlan} onChange={e => setPWorkPlan(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: pWorkPlan ? 'var(--fg)' : 'var(--fg3)', padding: '9px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="">— Aucun —</option>
                    {workPlans.map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                  {pWorkPlan && pFrom && pTo && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>
                      ✓ Les shifts seront générés automatiquement sur toute la période
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPeriodModal(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                <button onClick={confirmCreatePeriod} disabled={!pName.trim() || !pFrom || !pTo}
                  style={{ background: pName.trim() && pFrom && pTo ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: pName.trim() && pFrom && pTo ? '#fff' : 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: pName.trim() && pFrom && pTo ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Palette importée depuis template */}
      {importedPalette && (
        <div style={{ background: 'color-mix(in srgb, var(--accent) 6%, var(--bg2))', borderBottom: '1px solid var(--accent)44', padding: '10px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--accent)' }}>
              Plan : {importedPalette.tplName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg2)' }}>— glisser sur les employés</div>
            <button onClick={clearImport} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '2px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>✕ Fermer</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {FR_DAYS.map((day, di) => {
              const daySlots = importedPalette.slots.filter(s => s.day_index === di)
              return (
                <div key={di} style={{ minHeight: 32 }}>
                  <div style={{ fontSize: 9, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: 1, color: 'var(--fg3)', textTransform: 'uppercase', marginBottom: 4 }}>{day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {daySlots.map(slot => {
                      const def = shiftDefs.find(d => d.id === slot.shift_def_id)
                      if (!def) return null
                      return (
                        <div key={slot.slotKey} draggable onDragStart={e => onImportedDragStart(e, slot)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, cursor: 'grab', userSelect: 'none', background: def.color + '22', border: `1px solid ${def.color}55` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{def.label}</span>
                        </div>
                      )
                    })}
                    {daySlots.length === 0 && <div style={{ fontSize: 10, color: 'var(--fg3)', opacity: 0.4 }}>–</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active period header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 20px', borderBottom:'1px solid var(--border2)', flexShrink:0, background:'color-mix(in srgb, var(--accent) 6%, var(--bg))' }}>
        <button onClick={() => setActivePeriod(null)}
          style={{ background:'none', border:'1px solid var(--border)', color:'var(--fg2)', padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
          ← Périodes
        </button>
        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14 }}>{activePeriod.name}</div>
        <div style={{ fontSize:11, color:'var(--fg3)', marginLeft:4 }}>{activePeriod.date_from} → {activePeriod.date_to}</div>
      </div>

      {/* Nav bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
          <button onClick={() => setViewMode('week')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: viewMode === 'week' ? 'var(--bg2)' : 'transparent', color: viewMode === 'week' ? 'var(--fg)' : 'var(--fg3)', boxShadow: viewMode === 'week' ? '0 1px 3px rgba(0,0,0,.2)' : 'none' }}>Semaine</button>
          <button onClick={() => setViewMode('month')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: viewMode === 'month' ? 'var(--bg2)' : 'transparent', color: viewMode === 'month' ? 'var(--fg)' : 'var(--fg3)', boxShadow: viewMode === 'month' ? '0 1px 3px rgba(0,0,0,.2)' : 'none' }}>Mois</button>
        </div>

        {viewMode === 'week' ? (<>
          <button onClick={() => setWeekOffset(w => w-1)} style={wkBtnStyle}>‹</button>
          <button onClick={() => setWeekOffset(0)} style={{ ...wkBtnStyle, width: 'auto', height: 'auto', background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 12px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>Aujourd'hui</button>
          <button onClick={() => setWeekOffset(w => w+1)} style={wkBtnStyle}>›</button>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>
              Semaine {getISOWeek(dates[0])} — {dates[0].getFullYear()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg2)' }}>
              {dates[0].getDate()} {FR_MONTHS[dates[0].getMonth()]} → {dates[6].getDate()} {FR_MONTHS[dates[6].getMonth()]}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 12, color: 'var(--fg2)' }}>
            <span>Total : <strong style={{ color: 'var(--fg)' }}>{getWeekTotal().toFixed(0)}h</strong></span>
            <span>Shifts : <strong style={{ color: 'var(--fg)' }}>{getShiftCount()}</strong></span>
          </div>
        </>) : (<>
          <button onClick={() => setMonthYear(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })} style={wkBtnStyle}>‹</button>
          <button onClick={() => { const n = new Date(); setMonthYear({ year: n.getFullYear(), month: n.getMonth() }) }} style={{ ...wkBtnStyle, width: 'auto', height: 'auto', background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 12px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>Ce mois</button>
          <button onClick={() => setMonthYear(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })} style={wkBtnStyle}>›</button>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>
              {FR_MONTHS_LONG[monthYear.month]} {monthYear.year}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg2)' }}>
              {monthWeekDates && monthWeekDates(monthYear.year, monthYear.month).length} semaines
            </div>
          </div>
        </>)}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'week' ? (
          <WeekGrid
            dates={dates} today={today} employees={employees} shifts={shifts}
            shiftDefs={shiftDefs} dropTarget={dropTarget}
            getShifts={getShifts} getEmpWeekHours={getEmpWeekHours}
            getUnassignedShifts={getUnassignedShifts}
            onCellDragOver={onCellDragOver} onCellDragLeave={onCellDragLeave}
            onCellDrop={onCellDrop} onUnassignedDrop={onUnassignedDrop}
            onAssignedDragStart={onAssignedDragStart} onDeleteShift={onDeleteShift}
            openModal={openModal} setDropTarget={setDropTarget} fmtDate={fmtDate}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
            {(() => {
              // Compute weeks from period range
              const start = new Date(activePeriod.date_from + 'T00:00:00')
              const end   = new Date(activePeriod.date_to   + 'T00:00:00')
              const startDay = start.getDay()
              const mondayOffset = startDay === 0 ? -6 : 1 - startDay
              const firstMon = new Date(start)
              firstMon.setDate(firstMon.getDate() + mondayOffset)
              const periodWeeks = []
              let cur = new Date(firstMon)
              while (cur <= end) {
                periodWeeks.push(Array.from({ length: 7 }, (_, i) => { const d = new Date(cur); d.setDate(d.getDate() + i); return d }))
                cur.setDate(cur.getDate() + 7)
              }
              return periodWeeks
            })().map((weekDays, wi) => (
              <div key={wi} style={{ flexShrink: 0, borderRight: '2px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                {/* Week label */}
                <div style={{ padding: '6px 16px', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg2))', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>S{getISOWeek(weekDays[0])}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg2)' }}>{weekDays[0].getDate()} {FR_MONTHS[weekDays[0].getMonth()]} → {weekDays[6].getDate()} {FR_MONTHS[weekDays[6].getMonth()]}</span>
                  {/* week total */}
                  {(() => {
                    const wkShifts = shifts.filter(s => { const d = s.work_date; return d >= fmtDate(weekDays[0]) && d <= fmtDate(weekDays[6]) })
                    const total = wkShifts.reduce((a, s) => a + shiftDuration(s.start_time, s.end_time), 0)
                    return total > 0 ? <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--fg2)' }}>{total.toFixed(0)}h</span> : null
                  })()}
                </div>
                <div style={{ overflow: 'auto', flex: 1 }}>
                  <WeekGrid
                    dates={weekDays} today={today} employees={employees} shifts={shifts}
                    shiftDefs={shiftDefs} dropTarget={dropTarget}
                    getShifts={getShifts} getEmpWeekHours={(empId) => {
                      return shifts.filter(s => s.employee_id === empId && s.work_date >= fmtDate(weekDays[0]) && s.work_date <= fmtDate(weekDays[6]))
                        .reduce((acc, s) => acc + shiftDuration(s.start_time, s.end_time), 0)
                    }}
                    getUnassignedShifts={getUnassignedShifts}
                    onCellDragOver={onCellDragOver} onCellDragLeave={onCellDragLeave}
                    onCellDrop={onCellDrop} onUnassignedDrop={onUnassignedDrop}
                    onAssignedDragStart={onAssignedDragStart} onDeleteShift={onDeleteShift}
                    openModal={openModal} setDropTarget={setDropTarget} fmtDate={fmtDate}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal ajout shift */}
      {modal && (
        <div onClick={e => e.target === e.currentTarget && setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, minWidth: 360, maxWidth: 460, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 20 }}>{modal?.editId ? 'Modifier le shift' : 'Ajouter un shift'}</div>

            {/* Quick-pick shift defs */}
            {shiftDefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {shiftDefs.map(def => (
                  <button key={def.id} onClick={() => pickShiftDef(def)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${def.color}55`, background: modalLabel === def.label ? def.color + '33' : def.color + '11', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: def.color }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                    {def.label}
                  </button>
                ))}
              </div>
            )}

            <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Libellé</label>
            <input autoFocus value={modalLabel} onChange={e => setModalLabel(e.target.value)}
              placeholder="Ex: Matin, Soir, Coupure…"
              onKeyDown={e => e.key === 'Enter' && confirmModal()}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '9px 12px', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Début</label>
                <TimeInput value={modalStart} onChange={handleModalStartChange} />
              </div>
              <div style={{ marginTop: 18, fontSize: 14, color: 'var(--fg3)' }}>→</div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Fin</label>
                <TimeInput value={modalEnd} onChange={setModalEnd} />
              </div>
            </div>

            {modalViolations.length > 0 && (
              <div style={{ background: 'color-mix(in srgb,#f85149 12%,var(--bg))', border: '1px solid #f8514944', borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {modalViolations.map((v, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f85149', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>⚠</span>{v.message}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={confirmModal} disabled={!modalLabel.trim()}
                style={{ background: modalLabel.trim() ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: modalLabel.trim() ? '#fff' : 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: modalLabel.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                {modal?.editId ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sauver semaine comme plan de travail */}
      {saveModal && (
        <div onClick={e => e.target === e.currentTarget && setSaveModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, minWidth: 340, maxWidth: 460, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Sauver comme plan de travail</div>
            <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 16 }}>
              Les shifts de la semaine {getISOWeek(dates[0])} seront sauvegardés comme modèle réutilisable.
            </div>
            <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom du plan</label>
            <input autoFocus placeholder="Ex: Hiver, Été, Weekend chargé..." value={saveName}
              onChange={e => setSaveName(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmSave()}
              style={{ ...inputStyle, marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSaveModal(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={confirmSave} disabled={!saveName.trim()}
                style={{ background: saveName.trim() ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: saveName.trim() ? '#fff' : 'var(--fg3)', padding: '7px 18px', borderRadius: 8, cursor: saveName.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WeekGrid({ dates, today, employees, shifts, shiftDefs, dropTarget, getShifts, getEmpWeekHours, getUnassignedShifts, onCellDragOver, onCellDragLeave, onCellDrop, onUnassignedDrop, onAssignedDragStart, onDeleteShift, openModal, setDropTarget, fmtDate }) {
  return (
    <div style={{ minWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr) 56px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 16px', fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: 1, color: 'var(--fg3)', textTransform: 'uppercase' }}>EMPLOYÉ</div>
        {dates.map((d, i) => {
          const ds  = fmtDate(d)
          const sun = isSunday(ds)
          const hol = isHoliday(ds)
          return (
            <div key={i} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--border2)' }}>
              <div style={{ fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: sun ? '#f59e0b' : 'var(--fg2)' }}>{FR_DAYS[i]}</div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginTop: 1, color: ds === today ? 'var(--accent)' : sun ? '#f59e0b' : 'var(--fg)' }}>{d.getDate()}</div>
              {hol && <div style={{ fontSize: 9, color: '#ec4899', letterSpacing: .5 }}>FÉRIÉ</div>}
            </div>
          )
        })}
        <div style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '1px solid var(--border2)', fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: 'var(--fg3)' }}>H/SEM</div>
      </div>

      {/* Unassigned shifts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr) 56px', borderBottom: '2px solid var(--border)', background: 'color-mix(in srgb, var(--accent) 4%, var(--bg2))' }}>
        <div style={{ padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border2)', gap: 6 }}>
          <span style={{ fontSize: 14 }}>📥</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: 'var(--accent)', whiteSpace: 'nowrap' }}>À donner</div>
            <div style={{ fontSize: 9, color: 'var(--fg3)', marginTop: 1 }}>Glisser vers un employé</div>
          </div>
        </div>
        {dates.map((d, di) => {
          const ds = fmtDate(d)
          const unassigned = getUnassignedShifts(ds)
          const key = `unassigned_${ds}`
          const isDrop = dropTarget?.key === key
          const dropSide = dropTarget?.side
          return (
            <div key={di}
              onDragOver={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right'; setDropTarget({ key, side }) }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => onUnassignedDrop(e, ds)}
              style={{
                padding: 4, borderLeft: '1px solid var(--border2)', minHeight: 48, position: 'relative',
                background: isDrop ? (dropSide === 'left' ? 'color-mix(in srgb, #10b981 15%, var(--bg))' : 'color-mix(in srgb, var(--accent) 15%, var(--bg))') : 'transparent',
                outline: isDrop ? `2px dashed ${dropSide === 'left' ? '#10b981' : 'var(--accent)'}` : 'none', outlineOffset: -3, borderRadius: isDrop ? 4 : 0,
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
              {isDrop && <div style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, fontWeight: 700, color: dropSide === 'left' ? '#10b981' : 'var(--accent)', pointerEvents: 'none' }}>{dropSide === 'left' ? '⊕ Copier' : '→ Déplacer'}</div>}
              {unassigned.map(shift => (
                <UnassignedChip key={shift.id} shift={shift} onDelete={() => onDeleteShift(shift.id)} onDragStart={e => onAssignedDragStart(e, shift)} onEdit={() => openModal(null, null, shift)} />
              ))}
            </div>
          )
        })}
        <div style={{ borderLeft: '1px solid var(--border2)' }} />
      </div>

      {/* Rows */}
      {employees.map(emp => {
        const wh = getEmpWeekHours(emp.id)
        return (
          <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr) 56px', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ padding: '10px 8px 10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--border2)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.first_name} {emp.last_name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 1 }}>{emp.role}</div>
              <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>{emp.contract_pct}%</div>
            </div>
            {dates.map((d, di) => {
              const ds     = fmtDate(d)
              const dayShifts = getShifts(emp.id, ds)
              const key    = `${emp.id}_${ds}`
              const isDrop = dropTarget?.key === key
              const dropSide = dropTarget?.side
              const sun    = isSunday(ds)
              const hol    = isHoliday(ds)
              return (
                <div key={di}
                  onDragOver={e => onCellDragOver(e, emp.id, ds)}
                  onDragLeave={onCellDragLeave}
                  onDrop={e => onCellDrop(e, emp.id, ds)}
                  style={{
                    padding: 4, borderLeft: '1px solid var(--border2)', position: 'relative', minHeight: 68,
                    background: isDrop ? (dropSide === 'left' ? 'color-mix(in srgb, #10b981 12%, var(--bg))' : 'color-mix(in srgb, var(--accent) 12%, var(--bg))') : sun ? 'color-mix(in srgb, #f59e0b 4%, var(--bg))' : hol ? 'color-mix(in srgb, #ec4899 5%, var(--bg))' : ds === today ? 'color-mix(in srgb, var(--accent) 3%, var(--bg))' : 'transparent',
                    outline: isDrop ? `2px dashed ${dropSide === 'left' ? '#10b981' : 'var(--accent)'}` : 'none', outlineOffset: -3, borderRadius: isDrop ? 4 : 0,
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                  {isDrop && <div style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, fontWeight: 700, color: dropSide === 'left' ? '#10b981' : 'var(--accent)', pointerEvents: 'none', zIndex: 1 }}>{dropSide === 'left' ? '⊕ Copier' : '→ Déplacer'}</div>}
                  {dayShifts.map(shift => (
                    <AssignedChip key={shift.id} shift={shift} onDelete={() => onDeleteShift(shift.id)} onDragStart={e => onAssignedDragStart(e, shift)} onEdit={() => openModal(null, null, shift)} />
                  ))}
                  <div onClick={() => openModal(emp.id, ds)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg3)', fontSize: 16, borderRadius: 6, border: '1px dashed var(--border2)', cursor: 'pointer', opacity: dayShifts.length > 0 ? 0.25 : 0.4, transition: 'opacity .15s', minHeight: dayShifts.length > 0 ? 22 : 52 }}
                    onMouseEnter={e => e.currentTarget.style.opacity=1}
                    onMouseLeave={e => e.currentTarget.style.opacity= dayShifts.length > 0 ? 0.25 : 0.4}>
                    +
                  </div>
                </div>
              )
            })}
            <div style={{ borderLeft: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: wh > 45 ? '#f85149' : wh > 40 ? '#f59e0b' : wh > 0 ? '#3fb950' : 'var(--fg3)' }}>
                {wh > 0 ? `${wh.toFixed(0)}h` : '–'}
              </div>
              {wh > 45 && <div style={{ fontSize: 9, color: '#f85149' }}>MAX!</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}


function TimeInput({ value, onChange }) {
  const [h, m] = (value || '00:00').split(':')
  const mRef = useRef(null)

  function onHourChange(e) {
    let val = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (val.length === 2) {
      const n = Math.min(23, parseInt(val, 10))
      onChange(`${String(n).padStart(2,'0')}:${m}`)
      mRef.current?.focus()
      mRef.current?.select()
    } else {
      onChange(`${val.padStart(2,'0')}:${m}`)
    }
  }
  function onMinChange(e) {
    let val = e.target.value.replace(/\D/g, '').slice(0, 2)
    const n = Math.min(59, parseInt(val || '0', 10))
    onChange(`${h}:${String(n).padStart(2,'0')}`)
  }

  const fieldStyle = {
    width: 44, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--fg)', padding: '8px 4px', borderRadius: 8, fontSize: 16, fontFamily: "'DM Mono',monospace",
    fontWeight: 600, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text" inputMode="numeric" maxLength={2}
        value={h} onChange={onHourChange}
        onClick={e => e.target.select()}
        placeholder="HH"
        style={fieldStyle}
      />
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg2)' }}>:</span>
      <input
        ref={mRef}
        type="text" inputMode="numeric" maxLength={2}
        value={m} onChange={onMinChange}
        onClick={e => e.target.select()}
        placeholder="MM"
        style={fieldStyle}
      />
    </div>
  )
}

function UnassignedChip({ shift, onDelete, onDragStart, onEdit }) {
  const def   = shift.shift_defs || {}
  const color = def.color || '#818cf8'
  return (
    <div draggable onDragStart={onDragStart} onClick={e => { e.stopPropagation(); onEdit && onEdit() }}
      style={{ background: color + '1a', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: '4px 7px 4px 8px', cursor: 'pointer', position: 'relative', userSelect: 'none', flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{def.label || shift.start_time?.slice(0,5) || 'Shift'}</div>
      {shift.start_time && <div style={{ fontSize: 10, opacity: .75, marginTop: 1 }}>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</div>}
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ position: 'absolute', top: 3, right: 4, width: 16, height: 16, background: 'rgba(0,0,0,.3)', border: 'none', color: 'rgba(255,255,255,.6)', borderRadius: '50%', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

function AssignedChip({ shift, onDelete, onDragStart, onEdit }) {
  const def   = shift.shift_defs || {}
  const color = def.color || '#818cf8'
  return (
    <div draggable onDragStart={onDragStart} onClick={e => { e.stopPropagation(); onEdit && onEdit() }}
      style={{ background: color + '1a', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: '5px 7px 5px 10px', cursor: 'pointer', position: 'relative', userSelect: 'none', flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{def.label || shift.start_time?.slice(0,5) || 'Shift'}</div>
      {shift.start_time && <div style={{ fontSize: 10, opacity: .75, marginTop: 1 }}>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</div>}
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ position: 'absolute', top: 3, right: 4, width: 16, height: 16, background: 'rgba(0,0,0,.3)', border: 'none', color: 'rgba(255,255,255,.6)', borderRadius: '50%', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

const wkBtnStyle = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const inputStyle  = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', marginBottom: 12, boxSizing: 'border-box' }
