import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkShift, shiftDuration, isHoliday, isSunday } from '../lib/lgav'

const FR_DAYS   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const FR_MONTHS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

export default function Planning({ site, employees, shiftDefs, shifts, templates, weekOffset, setWeekOffset, onDropShift, onDeleteShift, onSaveTemplate, onRefreshShifts, weekDates, fmtDate }) {
  const [dragSource, setDragSource]   = useState(null)
  const dragRef = useRef(null)
  const [dropTarget, setDropTarget]   = useState(null)
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
  const [workPlans, setWorkPlans]       = useState([])
  const [generateModal, setGenerateModal] = useState(null) // { plan, planShifts }
  const [generating, setGenerating]     = useState(false)

  useEffect(() => {
    supabase
      .from('work_plans')
      .select('*')
      .order('created_at')
      .then(({ data }) => setWorkPlans(data || []))
  }, [])

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
    e.dataTransfer.dropEffect = dragRef.current?.type === 'assigned' ? 'move' : 'copy'
    setDropTarget(`${empId}_${dateStr}`)
  }
  function onCellDragLeave() { setDropTarget(null) }

  async function onCellDrop(e, empId, dateStr) {
    e.preventDefault()
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
      await onDeleteShift(s.id)
      await onDropShift({ employeeId: empId, workDate: dateStr, shiftDefId: s.shift_def_id, startTime: s.start_time, endTime: s.end_time })
    }
    dragRef.current = null
    setDragSource(null)
  }

  async function onUnassignedDrop(e, dateStr) {
    e.preventDefault()
    setDropTarget(null)
    const src = dragRef.current
    if (!src) return
    if (src.type === 'assigned' && src.shift.employee_id) {
      await onDeleteShift(src.shift.id)
      await onDropShift({ employeeId: null, workDate: dateStr, shiftDefId: src.shift.shift_def_id, startTime: src.shift.start_time, endTime: src.shift.end_time })
    } else if (src.type === 'palette' || src.type === 'imported') {
      const def = src.def
      await onDropShift({ employeeId: null, workDate: dateStr, shiftDefId: def.id, startTime: def.start_time, endTime: def.end_time })
    }
    dragRef.current = null
    setDragSource(null)
  }

  // ── Modal ajout shift ──────────────────────────────────────────
  function openModal(empId, date) {
    setModal({ empId, date })
    setModalLabel(''); setModalStart('08:00'); setModalEnd('16:00')
  }
  function pickShiftDef(def) {
    setModalLabel(def.label)
    if (def.start_time) { setModalStart(def.start_time.slice(0,5)); setModalEnd(def.end_time.slice(0,5)) }
  }
  async function confirmModal() {
    if (!modal || !modalLabel.trim()) return
    const matchedDef = shiftDefs.find(d => d.label === modalLabel.trim())
    await onDropShift({ employeeId: modal.empId, workDate: modal.date, shiftDefId: matchedDef?.id || null, startTime: modalStart, endTime: modalEnd })
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
  async function openGenerateModal(plan) {
    const { data: planShifts } = await supabase
      .from('work_plan_shifts')
      .select('*, shift_defs(*)')
      .eq('work_plan_id', plan.id)
      .order('day_of_week')
    setGenerateModal({ plan, planShifts: planShifts || [] })
  }

  async function confirmGenerate() {
    if (!generateModal) return
    setGenerating(true)
    const { plan, planShifts } = generateModal

    // Construire tous les rows en une fois (évite l'écrasement local de handleDropShift)
    const rows = []
    for (const ps of planShifts) {
      const def = ps.shift_defs
      if (!def) continue
      const date = dates[ps.day_of_week]
      if (!date) continue
      const dateStr = fmtDate(date)
      for (let i = 0; i < ps.quantity; i++) {
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

    if (rows.length > 0) {
      const { error } = await supabase.from('shifts').insert(rows)
      if (error) {
        console.error('Erreur génération shifts:', error)
      } else {
        // Forcer le rechargement immédiat sans attendre le realtime
        onRefreshShifts && await onRefreshShifts()
      }
    }

    setGenerating(false)
    setGenerateModal(null)
  }

  // Résumé par jour pour le modal de confirmation
  function generateSummary(planShifts) {
    const byDay = {}
    for (const ps of planShifts) {
      if (!byDay[ps.day_of_week]) byDay[ps.day_of_week] = []
      byDay[ps.day_of_week].push(ps)
    }
    return byDay
  }

  const modalViolations = modal ? checkShift({ startTime: modalStart, endTime: modalEnd, workDate: modal.date }) : []

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

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
        <button onClick={() => setWeekOffset(w => w-1)} style={wkBtnStyle}>‹</button>
        <button onClick={() => setWeekOffset(0)} style={{ ...wkBtnStyle, background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>Aujourd'hui</button>
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
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
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
              const isDrop = dropTarget === key
              return (
                <div key={di}
                  onDragOver={e => { e.preventDefault(); setDropTarget(key) }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => onUnassignedDrop(e, ds)}
                  style={{
                    padding: 4, borderLeft: '1px solid var(--border2)', minHeight: 48,
                    background: isDrop ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))' : 'transparent',
                    outline: isDrop ? '2px dashed var(--accent)' : 'none', outlineOffset: -3, borderRadius: isDrop ? 4 : 0,
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                  {unassigned.map(shift => (
                    <UnassignedChip key={shift.id} shift={shift} onDelete={() => onDeleteShift(shift.id)} onDragStart={e => onAssignedDragStart(e, shift)} />
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
                  const isDrop = dropTarget === key
                  const sun    = isSunday(ds)
                  const hol    = isHoliday(ds)
                  return (
                    <div key={di}
                      onDragOver={e => onCellDragOver(e, emp.id, ds)}
                      onDragLeave={onCellDragLeave}
                      onDrop={e => onCellDrop(e, emp.id, ds)}
                      style={{
                        padding: 4, borderLeft: '1px solid var(--border2)', position: 'relative', minHeight: 68,
                        background: isDrop ? 'color-mix(in srgb, var(--accent) 12%, var(--bg))' : sun ? 'color-mix(in srgb, #f59e0b 4%, var(--bg))' : hol ? 'color-mix(in srgb, #ec4899 5%, var(--bg))' : ds === today ? 'color-mix(in srgb, var(--accent) 3%, var(--bg))' : 'transparent',
                        outline: isDrop ? '2px dashed var(--accent)' : 'none', outlineOffset: -3, borderRadius: isDrop ? 4 : 0,
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                      {dayShifts.map(shift => (
                        <AssignedChip key={shift.id} shift={shift} onDelete={() => onDeleteShift(shift.id)} onDragStart={e => onAssignedDragStart(e, shift)} />
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
      </div>

      {/* ── Barre plans de travail ── */}
      <div style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fg3)', whiteSpace: 'nowrap', marginRight: 4 }}>
          Plans de travail
        </div>

        {workPlans.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg3)', fontStyle: 'italic' }}>Aucun plan — crée-en un dans Config</span>
        )}

        {workPlans.map(plan => (
          <button
            key={plan.id}
            onClick={() => openGenerateModal(plan)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg3)', color: 'var(--fg2)',
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)44' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--fg2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            ⚡ {plan.name}
          </button>
        ))}

        <button onClick={openSaveModal}
          style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, border: '1px dashed var(--border)', background: 'none', color: 'var(--fg3)', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          💾 Sauver cette semaine comme plan
        </button>
      </div>

      {/* ── Modal confirmation génération ── */}
      {generateModal && (
        <div onClick={e => e.target === e.currentTarget && !generating && setGenerateModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, minWidth: 380, maxWidth: 500, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              ⚡ Générer depuis "{generateModal.plan.name}"
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 18 }}>
              Les shifts seront créés non-assignés (📥 À donner) pour la semaine {getISOWeek(dates[0])}.
            </div>

            {/* Résumé par jour */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {generateModal.planShifts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--fg3)', textAlign: 'center', padding: 12 }}>
                  Ce plan est vide — ajoute des shifts dans Config.
                </div>
              ) : (() => {
                const byDay = generateSummary(generateModal.planShifts)
                return FR_DAYS.map((jour, di) => {
                  const dayPs = byDay[di]
                  if (!dayPs?.length) return null
                  const date = dates[di]
                  return (
                    <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, width: 36, color: 'var(--fg2)', fontFamily: "'Syne',sans-serif" }}>{jour}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg3)', width: 52 }}>
                        {date.getDate()} {FR_MONTHS[date.getMonth()]}
                      </span>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                        {dayPs.map(ps => {
                          const def = ps.shift_defs
                          if (!def) return null
                          return (
                            <span key={ps.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: def.color + '22', border: `1px solid ${def.color}44`, color: def.color,
                            }}>
                              {ps.quantity > 1 && <span style={{ fontFamily: "'DM Mono',monospace" }}>{ps.quantity}×</span>}
                              {def.label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {generateModal.planShifts.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 18, padding: '8px 12px', background: 'color-mix(in srgb, #f59e0b 8%, var(--bg))', border: '1px solid #f59e0b44', borderRadius: 8 }}>
                ⚠️ Les shifts existants non-assignés de cette semaine ne seront pas supprimés.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setGenerateModal(null)} disabled={generating}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                Annuler
              </button>
              <button onClick={confirmGenerate} disabled={generating || generateModal.planShifts.length === 0}
                style={{
                  background: generating || generateModal.planShifts.length === 0 ? 'var(--bg3)' : 'var(--accent)',
                  border: 'none', color: generating || generateModal.planShifts.length === 0 ? 'var(--fg3)' : '#fff',
                  padding: '7px 20px', borderRadius: 8,
                  cursor: generating || generateModal.planShifts.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}>
                {generating ? '⏳ Génération…' : '⚡ Générer les shifts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout shift */}
      {modal && (
        <div onClick={e => e.target === e.currentTarget && setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, minWidth: 320, maxWidth: 460, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Ajouter un shift</div>
            <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 16 }}>
              {employees.find(e => e.id === modal.empId)?.first_name} — {modal.date}
            </div>
            {shiftDefs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Choisir un type</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {shiftDefs.map(def => (
                    <button key={def.id} type="button" onClick={() => pickShiftDef(def)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', userSelect: 'none',
                        background: modalLabel === def.label ? def.color + '33' : def.color + '18',
                        border: `1px solid ${modalLabel === def.label ? def.color : def.color + '55'}`,
                        outline: modalLabel === def.label ? `2px solid ${def.color}` : 'none', outlineOffset: 1,
                      }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{def.label}</span>
                      {def.start_time && <span style={{ fontSize: 10, color: 'var(--fg2)' }}>{def.start_time.slice(0,5)}–{def.end_time.slice(0,5)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom du shift</label>
              <input autoFocus value={modalLabel} onChange={e => setModalLabel(e.target.value)}
                placeholder="Ex: Service soir, Coupé..." style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Début</label>
                <input type="time" value={modalStart} onChange={e => setModalStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Fin</label>
                <input type="time" value={modalEnd} onChange={e => setModalEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {modalViolations.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {modalViolations.map((v, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, marginBottom: 4, background: v.type === 'error' ? 'rgba(248,81,73,.12)' : v.type === 'warning' ? 'rgba(245,158,11,.12)' : 'rgba(88,166,255,.1)', color: v.type === 'error' ? '#f85149' : v.type === 'warning' ? '#f59e0b' : 'var(--accent)' }}>
                    {v.type === 'error' ? '⚠' : v.type === 'warning' ? '⚡' : 'ℹ'} {v.msg}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={confirmModal} disabled={!modalLabel.trim()}
                style={{ background: modalLabel.trim() ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: modalLabel.trim() ? '#fff' : 'var(--fg3)', padding: '7px 18px', borderRadius: 8, cursor: modalLabel.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                Ajouter
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

function UnassignedChip({ shift, onDelete, onDragStart }) {
  const def   = shift.shift_defs || {}
  const color = def.color || '#818cf8'
  return (
    <div draggable onDragStart={onDragStart}
      style={{ background: color + '1a', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: '4px 7px 4px 8px', cursor: 'grab', position: 'relative', userSelect: 'none', flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{def.label || shift.start_time?.slice(0,5) || 'Shift'}</div>
      {shift.start_time && <div style={{ fontSize: 10, opacity: .75, marginTop: 1 }}>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</div>}
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ position: 'absolute', top: 3, right: 4, width: 16, height: 16, background: 'rgba(0,0,0,.3)', border: 'none', color: 'rgba(255,255,255,.6)', borderRadius: '50%', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

function AssignedChip({ shift, onDelete, onDragStart }) {
  const def   = shift.shift_defs || {}
  const color = def.color || '#818cf8'
  return (
    <div draggable onDragStart={onDragStart}
      style={{ background: color + '1a', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: '5px 7px 5px 10px', cursor: 'grab', position: 'relative', userSelect: 'none', flexShrink: 0 }}>
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
