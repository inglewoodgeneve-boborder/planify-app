import { useState } from 'react'

const COLORS = ['#818cf8','#34d399','#f59e0b','#f87171','#38bdf8','#a78bfa','#fb923c','#4ade80','#e879f9','#94a3b8']

export default function Config({ site, employees, shiftDefs, onCreateEmployee, onDeleteEmployee, onCreateShiftDef, onDeleteShiftDef }) {
  const [tab, setTab] = useState('shifts')

  // Shift def form
  const [defLabel, setDefLabel]   = useState('')
  const [defStart, setDefStart]   = useState('08:00')
  const [defEnd, setDefEnd]       = useState('16:00')
  const [defColor, setDefColor]   = useState(COLORS[0])

  // Employee form
  const [empFirst, setEmpFirst]   = useState('')
  const [empLast, setEmpLast]     = useState('')
  const [empRole, setEmpRole]     = useState('')
  const [empPct, setEmpPct]       = useState('100')

  async function submitDef(e) {
    e.preventDefault()
    if (!defLabel.trim()) return
    await onCreateShiftDef({ label: defLabel.trim(), start_time: defStart, end_time: defEnd, color: defColor })
    setDefLabel(''); setDefStart('08:00'); setDefEnd('16:00'); setDefColor(COLORS[0])
  }

  async function submitEmp(e) {
    e.preventDefault()
    if (!empFirst.trim() || !empLast.trim()) return
    await onCreateEmployee({ first_name: empFirst.trim(), last_name: empLast.trim(), role: empRole.trim(), contract_pct: parseInt(empPct) || 100 })
    setEmpFirst(''); setEmpLast(''); setEmpRole(''); setEmpPct('100')
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 24 }}>Configuration</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[{ id: 'shifts', label: '⚡ Types de shifts' }, { id: 'employes', label: '👥 Employés' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--fg2)', padding: '8px 16px', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            marginBottom: -1, transition: 'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Types de shifts ── */}
      {tab === 'shifts' && (
        <div>
          {/* Formulaire */}
          <form onSubmit={submitDef} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Nouveau type de shift</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Nom</label>
                <input value={defLabel} onChange={e => setDefLabel(e.target.value)} placeholder="Ex: Service midi, Soir, Coupé..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Début</label>
                <input type="time" value={defStart} onChange={e => setDefStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Fin</label>
                <input type="time" value={defEnd} onChange={e => setDefEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Couleur</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setDefColor(c)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, border: defColor === c ? '3px solid white' : '2px solid transparent',
                    cursor: 'pointer', outline: defColor === c ? `2px solid ${c}` : 'none', outlineOffset: 1, transition: 'all .15s',
                  }} />
                ))}
              </div>
            </div>
            {/* Preview */}
            {defLabel && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Aperçu</label>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 8px', borderRadius: 8, background: defColor + '22', border: `1px solid ${defColor}55` }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: defColor, display: 'block' }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{defLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg2)' }}>{defStart}–{defEnd}</span>
                </div>
              </div>
            )}
            <button type="submit" disabled={!defLabel.trim()} style={{ background: defLabel.trim() ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: defLabel.trim() ? '#fff' : 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: defLabel.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
              + Ajouter ce type
            </button>
          </form>

          {/* Liste existants */}
          {shiftDefs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: 40 }}>Aucun type de shift — crée le premier ci-dessus</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shiftDefs.map(def => (
                <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{def.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg2)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20 }}>
                    {def.start_time?.slice(0,5)} – {def.end_time?.slice(0,5)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg3)' }}>
                    {(() => { const h = (new Date(`1970-01-01T${def.end_time}`) - new Date(`1970-01-01T${def.start_time}`)) / 3600000; return h > 0 ? `${h.toFixed(1)}h` : '' })()}
                  </span>
                  <button onClick={() => onDeleteShiftDef(def.id)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>Supprimer</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Employés ── */}
      {tab === 'employes' && (
        <div>
          {/* Formulaire */}
          <form onSubmit={submitEmp} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Nouvel employé</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Prénom</label>
                <input value={empFirst} onChange={e => setEmpFirst(e.target.value)} placeholder="Sophie" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Nom</label>
                <input value={empLast} onChange={e => setEmpLast(e.target.value)} placeholder="Bernard" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Poste / Rôle</label>
                <input value={empRole} onChange={e => setEmpRole(e.target.value)} placeholder="Serveuse, Chef de rang..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Taux d'occupation (%)</label>
                <input type="number" min="10" max="100" value={empPct} onChange={e => setEmpPct(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={!empFirst.trim() || !empLast.trim()} style={{ background: empFirst.trim() && empLast.trim() ? 'var(--accent)' : 'var(--bg3)', border: 'none', color: empFirst.trim() && empLast.trim() ? '#fff' : 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: empFirst.trim() && empLast.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
              + Ajouter cet employé
            </button>
          </form>

          {/* Liste existants */}
          {employees.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: 40 }}>Aucun employé — ajoute le premier ci-dessus</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {employees.map(emp => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.first_name} {emp.last_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 1 }}>{emp.role || '—'}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--fg2)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20 }}>{emp.contract_pct}%</span>
                  <button onClick={() => onDeleteEmployee(emp.id)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>Supprimer</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const labelStyle = { fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5 }
const inputStyle  = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }
