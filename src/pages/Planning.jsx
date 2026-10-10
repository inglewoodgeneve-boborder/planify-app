import { useState, useRef, useCallback } from 'react'
import { checkShift, shiftDuration, isHoliday, isSunday, weeklyHours } from '../lib/lgav'

const FR_DAYS   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const FR_MONTHS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

export default function Planning({ site, employees, shiftDefs, shifts, templates, weekOffset, setWeekOffset, onDropShift, onDeleteShift, onSaveTemplate, weekDates, fmtDate }) {
  const [dragSource, setDragSource]   = useState(null) // { type:'palette'|'assigned', ... }
  const [dropTarget, setDropTarget]   = useState(null) // `${empId}_${date}`
  const [modal, setModal]             = useState(null) // { empId, date }
  const [modalDef, setModalDef]       = useState('')
  const [modalStart, setModalStart]   = useState('08:00')
  const [modalEnd, setModalEnd]       = useState('16:00')

  const dates  = weekDates(weekOffset)
  const today  = fmtDate(new Date())

  // ── Helpers ────────────────────────────────────────────────
  function getShift(empId, dateStr) {
    return shifts.find(s => s.employee_id === empId && s.work_date === dateStr)
  }
  function getEmpWeekHours(empId) {
    const empShifts = shifts.filter(s => s.employee_id === empId)
    return empShifts.reduce((acc, s) => acc + shiftDuration(s.start_time, s.end_time), 0)
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
  function getISOWeek(d) {
    const jan4 = new Date(d.getFullYear(), 0, 4)
    return Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7)
  }

  // ── Drag & Drop ────────────────────────────────────────────
  function onPaletteDragStart(def) {
    setDragSource({ type: 'palette', def })
  }
  function onAssignedDragStart(shift) {
    setDragSource({ type: 'assigned', shift })
  }
  function onCellDragOver(e, empId, dateStr) {
    e.preventDefault()
    e.dataTransfer.dropEffect = dragSource?.type === 'assigned' ? 'move' : 'copy'
    setDropTarget(`${empId}_${dateStr}`)
  }
  function onCellDragLeave() {
    setDropTarget(null)
  }
  async function onCellDrop(e, empId, dateStr) {
    e.preventDefault()
    setDropTarget(null)
    if (!dragSource) return

    if (dragSource.type === 'palette') {
      const def = dragSource.def
      await onDropShift({
        employeeId:  empId,
        workDate:    dateStr,
        shiftDefId:  def.id,
        startTime:   def.start_time,
        endTime:     def.end_time,
      })
    } else if (dragSource.type === 'assigned') {
      const s = dragSource.shift
      const key = `${s.employee_id}_${s.work_date}`
      const newKey = `${empId}_${dateStr}`
      if (key === newKey) return
      // move: delete old, create new
      await onDeleteShift(s.id)
      await onDropShift({
        employeeId:  empId,
        workDate:    dateStr,
        shiftDefId:  s.shift_def_id,
        startTime:   s.start_time,
        endTime:     s.end_time,
      })
    }
    setDragSource(null)
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal(empId, date) {
    setModal({ empId, date })
    setModalDef(shiftDefs[0]?.id || '')
    setModalStart(shiftDefs[0]?.start_time?.slice(0,5) || '08:00')
    setModalEnd(shiftDefs[0]?.end_time?.slice(0,5) || '16:00')
  }
  function onModalDefChange(defId) {
    setModalDef(defId)
    const def = shiftDefs.find(d => d.id === defId)
    if (def?.start_time) {
      setModalStart(def.start_time.slice(0,5))
      setModalEnd(def.end_time.slice(0,5))
    }
  }
  async function confirmModal() {
    if (!modal) return
    const def = shiftDefs.find(d => d.id === modalDef)
    await onDropShift({
      employeeId:  modal.empId,
      workDate:    modal.date,
      shiftDefId:  modalDef,
      startTime:   modalStart,
      endTime:     modalEnd,
    })
    setModal(null)
  }

  // ── Save template ──────────────────────────────────────────
  async function handleSaveTemplate() {
    const name = window.prompt('Nom du plan de travail :', 'Semaine type')
    if (!name) return
    const slots = []
    employees.forEach((emp, ei) => {
      dates.forEach((d, di) => {
        const ds = fmtDate(d)
        const s = getShift(emp.id, ds)
        if (s) {
          slots.push({
            employee_index: ei,
            day_index:      di,
            shift_def_id:   s.shift_def_id,
            start_time:     s.start_time,
            end_time:       s.end_time,
          })
        }
      })
    })
    await onSaveTemplate(name, slots)
  }

  // ── Apply template ─────────────────────────────────────────
  async function applyTemplate(tpl) {
    for (const slot of (tpl.week_template_slots || [])) {
      const emp = employees[slot.employee_index]
      if (!emp) continue
      const d   = dates[slot.day_index]
      if (!d) continue
      await onDropShift({
        employeeId:  emp.id,
        workDate:    fmtDate(d),
        shiftDefId:  slot.shift_def_id,
        startTime:   slot.start_time,
        endTime:     slot.end_time,
      })
    }
  }

  const modalViolations = modal ? checkShift({ startTime: modalStart, endTime: modalEnd, workDate: modal.date }) : []

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Palette */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '10px 20px', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 8 }}>
          Shifts — glisser vers le planning
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {shiftDefs.map(def => (
            <div key={def.id} draggable
              onDragStart={() => onPaletteDragStart(def)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 8px', borderRadius: 8, cursor: 'grab', userSelect: 'none', background: def.color + '22', border: `1px solid ${def.color}55`, transition: 'all .15s' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: def.color, flexShrink: 0, display: 'block' }} />
              <span style={{ fontWeight: 600, fontSize: 12 }}>{def.label}</span>
              {def.start_time && <span style={{ fontSize: 11, color: 'var(--fg2)' }}>{def.start_time.slice(0,5)}–{def.end_time.slice(0,5)}</span>}
            </div>
          ))}
        </div>
      </div>

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

          {/* Rows */}
          {employees.map(emp => {
            const wh = getEmpWeekHours(emp.id)
            return (
              <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr) 56px', borderBottom: '1px solid var(--border2)', minHeight: 68 }}>
                {/* Emp info */}
                <div style={{ padding: '10px 8px 10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--border2)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.role}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>{emp.contract_pct}%</div>
                </div>

                {/* Day cells */}
                {dates.map((d, di) => {
                  const ds    = fmtDate(d)
                  const shift = getShift(emp.id, ds)
                  const key   = `${emp.id}_${ds}`
                  const isDrop = dropTarget === key
                  const sun   = isSunday(ds)
                  const hol   = isHoliday(ds)
                  return (
                    <div key={di}
                      onDragOver={e => onCellDragOver(e, emp.id, ds)}
                      onDragLeave={onCellDragLeave}
                      onDrop={e => onCellDrop(e, emp.id, ds)}
                      style={{
                        padding: 4, borderLeft: '1px solid var(--border2)', position: 'relative', minHeight: 68,
                        background: isDrop ? 'color-mix(in srgb, var(--accent) 12%, var(--bg))' : sun ? 'color-mix(in srgb, #f59e0b 4%, var(--bg))' : hol ? 'color-mix(in srgb, #ec4899 5%, var(--bg))' : ds === today ? 'color-mix(in srgb, var(--accent) 3%, var(--bg))' : 'transparent',
                        outline: isDrop ? '2px dashed var(--accent)' : 'none', outlineOffset: -3, borderRadius: isDrop ? 4 : 0,
                      }}>
                      {shift ? (
                        <AssignedChip shift={shift} onDelete={() => onDeleteShift(shift.id)} onDragStart={() => onAssignedDragStart(shift)} />
                      ) : (
                        <div onClick={() => openModal(emp.id, ds)} style={{ height: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg3)', fontSize: 18, borderRadius: 6, border: '1px dashed var(--border2)', cursor: 'pointer', opacity: 0.4, transition: 'opacity .15s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity=1} onMouseLeave={e => e.currentTarget.style.opacity=0.4}>+</div>
                      )}
                    </div>
                  )
                })}

                {/* Hours */}
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

      {/* Templates bar */}
      <div style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fg3)', whiteSpace: 'nowrap' }}>Plans de travail</div>
        {templates.map(tpl => (
          <button key={tpl.id} onClick={() => applyTemplate(tpl)}
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--fg2)', cursor: 'pointer' }}>
            {tpl.name}
          </button>
        ))}
        <button onClick={handleSaveTemplate} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, border: '1px dashed var(--border)', background: 'none', color: 'var(--fg3)', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          + Sauver cette semaine
        </button>
      </div>

      {/* Add shift modal */}
      {modal && (
        <div onClick={e => e.target === e.currentTarget && setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, minWidth: 320, maxWidth: 440, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Ajouter un shift</div>
            <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 16 }}>
              {employees.find(e => e.id === modal.empId)?.first_name} — {modal.date}
            </div>
            <label style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Modèle</label>
            <select value={modalDef} onChange={e => onModalDefChange(e.target.value)} style={inputStyle}>
              {shiftDefs.map(d => <option key={d.id} value={d.id}>{d.label}{d.start_time ? ` (${d.start_time.slice(0,5)}–${d.end_time.slice(0,5)})` : ''}</option>)}
            </select>
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
              <button onClick={confirmModal} style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '7px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignedChip({ shift, onDelete, onDragStart }) {
  const def = shift.shift_defs || {}
  const color = def.color || '#818cf8'
  return (
    <div draggable onDragStart={onDragStart}
      style={{ background: color + '1a', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: '5px 7px 5px 10px', minHeight: 52, cursor: 'grab', position: 'relative', userSelect: 'none' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{def.label || 'Shift'}</div>
      {shift.start_time && <div style={{ fontSize: 10, opacity: .75, marginTop: 1 }}>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</div>}
      <div style={{ fontSize: 9, marginTop: 3, opacity: .6 }}>{shift.status === 'confirmed' ? '✓ confirmé' : 'brouillon'}</div>
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ position: 'absolute', top: 3, right: 4, width: 16, height: 16, background: 'rgba(0,0,0,.3)', border: 'none', color: 'rgba(255,255,255,.6)', borderRadius: '50%', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

const wkBtnStyle = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const inputStyle  = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', marginBottom: 12 }
