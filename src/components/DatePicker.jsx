import { useState, useRef, useEffect } from 'react'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS   = ['Lu','Ma','Me','Je','Ve','Sa','Di']

function parseISO(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return isNaN(y) ? null : new Date(y, m - 1, d)
}
function toISO(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function firstDow(y, m) {
  // Monday=0
  const d = new Date(y, m, 1).getDay()
  return (d + 6) % 7
}

export default function DatePicker({
  value,           // ISO string yyyy-mm-dd or ''
  onChange,        // (isoString) => void
  placeholder = 'JJ.MM.AAAA',
  minYear,         // default: current year - 100
  maxYear,         // default: current year + 5
  style = {},      // outer wrapper style
  inputStyle = {}, // style merged onto the trigger button
  compact = false, // smaller variant for date range pickers
}) {
  const now = new Date()
  const minY = minYear ?? now.getFullYear() - 100
  const maxY = maxYear ?? now.getFullYear() + 5

  const selected = parseISO(value)
  const [open, setOpen]       = useState(false)
  const [viewY, setViewY]     = useState(selected?.getFullYear() ?? now.getFullYear())
  const [viewM, setViewM]     = useState(selected?.getMonth()    ?? now.getMonth())
  const [pickingY, setPickingY] = useState(false)
  const [pickingM, setPickingM] = useState(false)

  const wrapRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setPickingY(false); setPickingM(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // When value changes externally, sync view
  useEffect(() => {
    if (selected) { setViewY(selected.getFullYear()); setViewM(selected.getMonth()) }
  }, [value])

  function selectDate(y, m, d) {
    const iso = toISO(new Date(y, m, d))
    onChange(iso)
    setOpen(false); setPickingY(false); setPickingM(false)
  }

  function prevMonth() {
    if (viewM === 0) { setViewY(y => y - 1); setViewM(11) }
    else setViewM(m => m - 1)
  }
  function nextMonth() {
    if (viewM === 11) { setViewY(y => y + 1); setViewM(0) }
    else setViewM(m => m + 1)
  }

  // Build calendar grid
  const totalDays = daysInMonth(viewY, viewM)
  const startDow  = firstDow(viewY, viewM)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const isSelected = (d) => selected && selected.getFullYear() === viewY && selected.getMonth() === viewM && selected.getDate() === d
  const isToday    = (d) => now.getFullYear() === viewY && now.getMonth() === viewM && now.getDate() === d

  const displayValue = selected
    ? `${String(selected.getDate()).padStart(2,'0')}.${String(selected.getMonth()+1).padStart(2,'0')}.${selected.getFullYear()}`
    : ''

  // Year grid for year picker
  const years = []
  for (let y = maxY; y >= minY; y--) years.push(y)

  const s = {
    wrap: { position: 'relative', display: 'inline-block', ...style },
    trigger: {
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--bg)', border: '1px solid var(--border)', color: displayValue ? 'var(--fg)' : 'var(--fg3)',
      padding: compact ? '6px 10px' : '8px 12px',
      borderRadius: 8, cursor: 'pointer', fontSize: compact ? 12 : 13,
      fontFamily: "'DM Mono',monospace", outline: 'none',
      minWidth: compact ? 110 : 130, justifyContent: 'space-between',
      ...inputStyle,
    },
    popup: {
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      width: 272, overflow: 'hidden',
      animation: 'fadeIn .12s ease',
    },
    navRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px 8px',
    },
    navBtn: {
      background: 'none', border: '1px solid var(--border)', color: 'var(--fg2)',
      width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 15,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    monthYearRow: { display: 'flex', gap: 6 },
    headerBtn: (active) => ({
      background: active ? 'var(--accent)' : 'var(--bg3)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
      color: active ? '#fff' : 'var(--fg)',
      padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
      fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif",
    }),
    dayGrid: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, padding: '4px 10px 12px' },
    dayLabel: { textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--fg3)', padding: '4px 0', letterSpacing: '0.04em' },
    cell: (d, isSel, isTod) => ({
      textAlign: 'center', padding: '5px 0', borderRadius: 6, cursor: d ? 'pointer' : 'default',
      fontSize: 13, fontWeight: isSel ? 700 : 400,
      background: isSel ? 'var(--accent)' : isTod ? 'var(--accent-dim)' : 'transparent',
      color: isSel ? '#fff' : isTod ? 'var(--accent)' : d ? 'var(--fg)' : 'transparent',
      border: isTod && !isSel ? '1px solid var(--accent)55' : '1px solid transparent',
      transition: 'background .1s',
    }),
    clearBtn: {
      display: 'block', width: '100%', background: 'none', border: 'none',
      borderTop: '1px solid var(--border)', color: 'var(--fg3)',
      padding: '8px 0', cursor: 'pointer', fontSize: 11, textAlign: 'center',
    },
    scrollGrid: {
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4,
      padding: '10px 12px', maxHeight: 200, overflowY: 'auto',
    },
    scrollCell: (active) => ({
      padding: '6px 4px', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
      fontSize: 12, fontWeight: active ? 700 : 400,
      background: active ? 'var(--accent)' : 'var(--bg3)',
      color: active ? '#fff' : 'var(--fg)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    }),
  }

  return (
    <div style={s.wrap} ref={wrapRef}>
      <button
        type="button"
        style={s.trigger}
        onClick={() => { setOpen(o => !o); setPickingY(false); setPickingM(false) }}
      >
        <span>{displayValue || placeholder}</span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>📅</span>
      </button>

      {open && (
        <div style={s.popup}>
          {/* Nav row */}
          <div style={s.navRow}>
            {!pickingY && !pickingM && (
              <button type="button" style={s.navBtn} onClick={prevMonth}>‹</button>
            )}
            <div style={s.monthYearRow}>
              <button type="button" style={s.headerBtn(pickingM)} onClick={() => { setPickingM(m => !m); setPickingY(false) }}>
                {MONTHS[viewM]}
              </button>
              <button type="button" style={s.headerBtn(pickingY)} onClick={() => { setPickingY(y => !y); setPickingM(false) }}>
                {viewY}
              </button>
            </div>
            {!pickingY && !pickingM && (
              <button type="button" style={s.navBtn} onClick={nextMonth}>›</button>
            )}
            {(pickingY || pickingM) && <div style={{ width: 28 }} />}
          </div>

          {/* Year picker */}
          {pickingY && (
            <div style={s.scrollGrid}>
              {years.map(y => (
                <div key={y} style={s.scrollCell(y === viewY)} onClick={() => { setViewY(y); setPickingY(false) }}>
                  {y}
                </div>
              ))}
            </div>
          )}

          {/* Month picker */}
          {pickingM && (
            <div style={s.scrollGrid}>
              {MONTHS.map((m, i) => (
                <div key={i} style={s.scrollCell(i === viewM)} onClick={() => { setViewM(i); setPickingM(false) }}>
                  {m.slice(0,3)}
                </div>
              ))}
            </div>
          )}

          {/* Calendar grid */}
          {!pickingY && !pickingM && (
            <div style={s.dayGrid}>
              {DAYS.map(d => <div key={d} style={s.dayLabel}>{d}</div>)}
              {cells.map((d, i) => (
                <div
                  key={i}
                  style={s.cell(d, isSelected(d), isToday(d))}
                  onClick={() => d && selectDate(viewY, viewM, d)}
                >
                  {d || ''}
                </div>
              ))}
            </div>
          )}

          {value && (
            <button type="button" style={s.clearBtn} onClick={() => { onChange(''); setOpen(false) }}>
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
