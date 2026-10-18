import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DatePicker from '../components/DatePicker'

const COLORS = ['#818cf8','#34d399','#f59e0b','#f87171','#38bdf8','#a78bfa','#fb923c','#4ade80','#e879f9','#94a3b8']

const CONTRACT_TYPES = [
  { value: 'cdi',         label: 'CDI — Fixe durée indéterminée' },
  { value: 'cdd',         label: 'CDD — Fixe durée déterminée' },
  { value: 'cdi_horaire', label: 'CDI horaire' },
  { value: 'cdd_horaire', label: 'CDD horaire' },
]

const CONTRACT_LABEL = Object.fromEntries(CONTRACT_TYPES.map(c => [c.value, c.label]))

const EMPTY_EMP = {
  first_name: '', last_name: '', role: '', contract_pct: '100',
  email: '', phone: '',
  address_street: '', address_zip: '', address_city: '', address_country: 'Suisse',
  birth_date: '', hire_date: '',
  contract_type: 'cdi', hourly_rate: '', avs_number: '', weekly_hours_ref: '42', monthly_salary: '',
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// ── Styles constants (defined at top so WorkPlanTab can use them) ──────────
const lbl          = { fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
const inp          = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }
const sectionTitle = { fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 14 }
const btnPrimary   = { background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnDisabled  = { background: 'var(--bg3)', border: 'none', color: 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnGhost     = { background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans',sans-serif" }

// ── ContratFixeFields ────────────────────────────────────────────────────────
function ContratFixeFields({ emp, setF }) {
  const ref = parseFloat(emp.weekly_hours_ref) || 0
  const pct = parseFloat(emp.contract_pct) || 100
  const eff = ref > 0 ? (ref * pct / 100).toFixed(2) : null
  return (
    <>
      <div>
        <label style={lbl}>Heures hebdo (100%)</label>
        <input type="number" step="0.5" min="1" max="84" value={emp.weekly_hours_ref} onChange={setF('weekly_hours_ref')} placeholder="42" style={inp} />
      </div>
      <div>
        <label style={lbl}>Taux d'occupation (%)</label>
        <input type="number" min="10" max="100" value={emp.contract_pct} onChange={setF('contract_pct')} style={inp} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={lbl}>Heures effectives / semaine</label>
        <div style={{ ...inp, background: 'var(--bg3)', color: eff ? 'var(--accent)' : 'var(--fg3)', fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 15 }}>
          {eff ? eff + ' h' : '—'}
        </div>
      </div>
    </>
  )
}


// ── EmployeeRates : taux horaires par type de shift ──────────────────────────
function EmployeeRates({ employeeId, shiftDefs }) {
  const [rates, setRates]     = useState([])
  const [loading, setLoading] = useState(true)
  const [newDef, setNewDef]   = useState('')
  const [newRate, setNewRate] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!employeeId) { setRates([]); setLoading(false); return }
    supabase.from('employee_rates')
      .select('*')
      .eq('employee_id', employeeId)
      .then(({ data }) => { setRates(data || []); setLoading(false) })
  }, [employeeId])

  const available = shiftDefs.filter(d => !rates.find(r => r.shift_def_id === d.id))

  async function addRate(e) {
    e.preventDefault()
    if (!newDef || !newRate) return
    setSaving(true)
    const { data, error } = await supabase.from('employee_rates').insert({
      employee_id: employeeId,
      shift_def_id: newDef,
      hourly_rate: parseFloat(newRate),
    }).select().single()
    if (!error && data) { setRates(r => [...r, data]); setNewDef(''); setNewRate('') }
    setSaving(false)
  }

  async function removeRate(id) {
    await supabase.from('employee_rates').delete().eq('id', id)
    setRates(r => r.filter(x => x.id !== id))
  }

  async function updateRate(id, value) {
    const v = parseFloat(value)
    if (isNaN(v)) return
    await supabase.from('employee_rates').update({ hourly_rate: v }).eq('id', id)
    setRates(r => r.map(x => x.id === id ? { ...x, hourly_rate: v } : x))
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--fg3)', gridColumn: '1 / -1' }}>Chargement…</div>

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={lbl}>Taux horaires par type de shift</label>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {rates.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg3)' }}>
            Aucun taux spécifique — le taux de base s'applique à tous les shifts
          </div>
        )}
        {rates.map(rate => {
          const def = shiftDefs.find(d => d.id === rate.shift_def_id)
          if (!def) return null
          return (
            <div key={rate.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{def.label}</span>
              <span style={{ fontSize: 11, color: 'var(--fg3)' }}>{def.start_time?.slice(0,5)}–{def.end_time?.slice(0,5)}</span>
              <input
                type="number" step="0.05" min="0"
                defaultValue={rate.hourly_rate}
                onBlur={e => updateRate(rate.id, e.target.value)}
                style={{ ...inp, width: 90, padding: '4px 8px', fontFamily: "'DM Mono',monospace", fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: 'var(--fg3)' }}>CHF/h</span>
              <button onClick={() => removeRate(rate.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg3)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
          )
        })}
        {available.length > 0 && (
          <form onSubmit={addRate} style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--bg2)', alignItems: 'center' }}>
            <select value={newDef} onChange={e => setNewDef(e.target.value)} style={{ ...inp, flex: 1, padding: '6px 8px' }}>
              <option value="">— Choisir un type de shift</option>
              {available.map(d => (
                <option key={d.id} value={d.id}>{d.label} ({d.start_time?.slice(0,5)}–{d.end_time?.slice(0,5)})</option>
              ))}
            </select>
            <input
              type="number" step="0.05" min="0"
              value={newRate} onChange={e => setNewRate(e.target.value)}
              placeholder="CHF/h"
              style={{ ...inp, width: 90, padding: '6px 8px', fontFamily: "'DM Mono',monospace" }}
            />
            <button type="submit" disabled={!newDef || !newRate || saving}
              style={newDef && newRate && !saving ? { ...btnPrimary, padding: '6px 14px' } : { ...btnDisabled, padding: '6px 14px' }}>
              + Ajouter
            </button>
          </form>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 6 }}>
        💡 Ces taux remplacent le taux de base pour le calcul des staff costs par shift
      </div>
    </div>
  )
}

// ── DayRow ───────────────────────────────────────────────────────────────────
function DayRow({ dayIndex, jour, dayShifts, shiftDefs, onAdd, onRemove, onUpdateQty, onCopyToAll, onCopyTo }) {
  const [showAddMenu, setShowAddMenu]   = useState(false)
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const totalDay = dayShifts.reduce((acc, ps) => acc + ps.quantity, 0)

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'visible' }}>
      {/* Header du jour */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: dayShifts.length > 0 ? '1px solid var(--border)' : 'none' }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, width: 80, flexShrink: 0 }}>{jour}</span>
        <span style={{ fontSize: 12, color: 'var(--fg3)', flex: 1 }}>
          {totalDay === 0 ? 'Aucun shift' : `${totalDay} shift${totalDay > 1 ? 's' : ''}`}
        </span>

        {/* Bouton Copier → */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowCopyMenu(v => !v); setShowAddMenu(false) }}
            style={{ ...btnGhost, fontSize: 11, color: 'var(--fg2)' }}
          >
            Copier →
          </button>
          {showCopyMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, minWidth: 200, boxShadow: '0 8px 24px #0006',
            }}>
              <div
                onClick={() => { onCopyToAll(); setShowCopyMenu(false) }}
                style={{ padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                → Tous les autres jours
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              {JOURS.map((j, i) => i !== dayIndex && (
                <div
                  key={i}
                  onClick={() => { onCopyTo(i); setShowCopyMenu(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  → {j} seulement
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div
                onClick={() => setShowCopyMenu(false)}
                style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--fg3)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Annuler
              </div>
            </div>
          )}
        </div>

        {/* Bouton + Shift */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowAddMenu(v => !v); setShowCopyMenu(false) }}
            style={{ ...btnPrimary, padding: '4px 12px', fontSize: 12 }}
          >
            + Shift
          </button>
          {showAddMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, minWidth: 220, boxShadow: '0 8px 24px #0006',
            }}>
              {shiftDefs.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--fg3)' }}>
                  Aucun type de shift — crée-en dans l'onglet Types
                </div>
              ) : shiftDefs.map(def => (
                <div
                  key={def.id}
                  onClick={() => { onAdd(dayIndex, def.id); setShowAddMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 6, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{def.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg3)', fontFamily: "'DM Mono',monospace" }}>
                    {def.start_time?.slice(0,5)}–{def.end_time?.slice(0,5)}
                  </span>
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div
                onClick={() => setShowAddMenu(false)}
                style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--fg3)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Annuler
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chips des shifts du jour */}
      {dayShifts.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {dayShifts.map(ps => {
            const def = shiftDefs.find(d => d.id === ps.shift_def_id)
            if (!def) return null
            return (
              <div key={ps.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: def.color + '18', border: `1px solid ${def.color}44`,
                borderRadius: 8, padding: '5px 10px',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</span>
                <span style={{ fontSize: 11, color: 'var(--fg3)', fontFamily: "'DM Mono',monospace" }}>
                  {def.start_time?.slice(0,5)}–{def.end_time?.slice(0,5)}
                </span>
                {/* Contrôle quantité */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                  <button
                    onClick={() => onUpdateQty(ps.id, ps.quantity - 1)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg2)', padding: 0 }}
                  >−</button>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{ps.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(ps.id, ps.quantity + 1)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg2)', padding: 0 }}
                  >+</button>
                </div>
                <button
                  onClick={() => onRemove(ps.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg3)', fontSize: 15, lineHeight: 1, padding: '0 2px', marginLeft: 2 }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── WorkPlanTab ──────────────────────────────────────────────────────────────
function WorkPlanTab({ shiftDefs }) {
  const [plans, setPlans]             = useState([])
  const [selectedPlan, setSelected]   = useState(null)
  const [planShifts, setPlanShifts]   = useState([])
  const [newPlanName, setNewPlanName] = useState('')
  const [creating, setCreating]       = useState(false)
  const [busy, setBusy]               = useState(false)

  useEffect(() => { loadPlans() }, [])
  useEffect(() => {
    if (selectedPlan) loadPlanShifts(selectedPlan.id)
    else setPlanShifts([])
  }, [selectedPlan])

  async function loadPlans() {
    const { data } = await supabase.from('work_plans').select('*').order('created_at')
    const list = data || []
    setPlans(list)
    if (list.length && !selectedPlan) setSelected(list[0])
  }

  async function loadPlanShifts(planId) {
    const { data } = await supabase
      .from('work_plan_shifts')
      .select('*')
      .eq('work_plan_id', planId)
      .order('day_of_week')
    setPlanShifts(data || [])
  }

  async function createPlan(e) {
    e.preventDefault()
    if (!newPlanName.trim()) return
    setCreating(true)
    const { data } = await supabase.from('work_plans').insert({ name: newPlanName.trim() }).select().single()
    setCreating(false)
    setNewPlanName('')
    if (data) {
      setPlans(p => [...p, data])
      setSelected(data)
      setPlanShifts([])
    }
  }

  async function deletePlan(planId) {
    if (!confirm('Supprimer ce plan de travail et tous ses shifts ?')) return
    await supabase.from('work_plans').delete().eq('id', planId)
    const remaining = plans.filter(x => x.id !== planId)
    setPlans(remaining)
    if (selectedPlan?.id === planId) {
      setSelected(remaining[0] || null)
      setPlanShifts([])
    }
  }

  async function addShiftToDay(dayIndex, shiftDefId) {
    if (!selectedPlan || !shiftDefId) return
    const existing = planShifts.find(ps => ps.day_of_week === dayIndex && ps.shift_def_id === shiftDefId)
    if (existing) {
      const newQty = existing.quantity + 1
      await supabase.from('work_plan_shifts').update({ quantity: newQty }).eq('id', existing.id)
      setPlanShifts(ps => ps.map(x => x.id === existing.id ? { ...x, quantity: newQty } : x))
    } else {
      const { data } = await supabase.from('work_plan_shifts').insert({
        work_plan_id: selectedPlan.id,
        day_of_week: dayIndex,
        shift_def_id: shiftDefId,
        quantity: 1,
      }).select().single()
      if (data) setPlanShifts(ps => [...ps, data])
    }
  }

  async function removeShiftFromDay(psId) {
    await supabase.from('work_plan_shifts').delete().eq('id', psId)
    setPlanShifts(ps => ps.filter(x => x.id !== psId))
  }

  async function updateQty(psId, newQty) {
    if (newQty < 1) { await removeShiftFromDay(psId); return }
    await supabase.from('work_plan_shifts').update({ quantity: newQty }).eq('id', psId)
    setPlanShifts(ps => ps.map(x => x.id === psId ? { ...x, quantity: newQty } : x))
  }

  // Copier les shifts d'un jour source vers une liste de jours cibles
  async function copyDay(fromDay, targetDays) {
    if (!selectedPlan) return
    const source = planShifts.filter(ps => ps.day_of_week === fromDay)
    if (source.length === 0) { alert('Aucun shift à copier pour ce jour.'); return }
    setBusy(true)
    for (const toDay of targetDays) {
      // Supprimer les shifts existants du jour cible
      const existingIds = planShifts.filter(ps => ps.day_of_week === toDay).map(ps => ps.id)
      if (existingIds.length) {
        await supabase.from('work_plan_shifts').delete().in('id', existingIds)
      }
      // Insérer les copies
      await supabase.from('work_plan_shifts').insert(
        source.map(ds => ({
          work_plan_id: selectedPlan.id,
          day_of_week: toDay,
          shift_def_id: ds.shift_def_id,
          quantity: ds.quantity,
        }))
      )
    }
    await loadPlanShifts(selectedPlan.id)
    setBusy(false)
  }

  const totalShiftsInPlan = planShifts.reduce((acc, ps) => acc + ps.quantity, 0)

  return (
    <div>
      {/* Sélecteur / création de plan */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {plans.map(p => (
          <button key={p.id} onClick={() => setSelected(p)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: selectedPlan?.id === p.id ? 'var(--accent)' : 'var(--bg2)',
            color: selectedPlan?.id === p.id ? '#fff' : 'var(--fg2)',
            border: selectedPlan?.id === p.id ? '2px solid var(--accent)' : '1px solid var(--border)',
            transition: 'all .15s',
          }}>{p.name}</button>
        ))}
        <form onSubmit={createPlan} style={{ display: 'flex', gap: 6 }}>
          <input
            value={newPlanName}
            onChange={e => setNewPlanName(e.target.value)}
            placeholder="Nouveau plan…"
            style={{ ...inp, width: 160, padding: '6px 10px' }}
          />
          <button type="submit" disabled={!newPlanName.trim() || creating} style={newPlanName.trim() && !creating ? btnPrimary : btnDisabled}>
            +
          </button>
        </form>
      </div>

      {!selectedPlan ? (
        <div style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: 40 }}>
          Crée un plan de travail ci-dessus pour commencer
        </div>
      ) : (
        <>
          {/* En-tête du plan sélectionné */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--fg2)' }}>
              <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{selectedPlan.name}</span>
              {totalShiftsInPlan > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--fg3)' }}>
                  — {totalShiftsInPlan} shift{totalShiftsInPlan > 1 ? 's' : ''}/semaine
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {busy && <span style={{ fontSize: 12, color: 'var(--accent)' }}>Enregistrement…</span>}
              <button onClick={() => deletePlan(selectedPlan.id)} style={{ ...btnGhost, color: '#e55', borderColor: '#e5522244' }}>
                Supprimer ce plan
              </button>
            </div>
          </div>

          {/* Grille par jour */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {JOURS.map((jour, dayIndex) => {
              const dayShifts = planShifts.filter(ps => ps.day_of_week === dayIndex)
              const otherDays = [0,1,2,3,4,5,6].filter(d => d !== dayIndex)
              return (
                <DayRow
                  key={dayIndex}
                  dayIndex={dayIndex}
                  jour={jour}
                  dayShifts={dayShifts}
                  shiftDefs={shiftDefs}
                  onAdd={addShiftToDay}
                  onRemove={removeShiftFromDay}
                  onUpdateQty={updateQty}
                  onCopyToAll={() => copyDay(dayIndex, otherDays)}
                  onCopyTo={(toDay) => copyDay(dayIndex, [toDay])}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Config (default export) ──────────────────────────────────────────────────
export default function Config({ site, employees, shiftDefs, onCreateEmployee, onUpdateEmployee, onDeleteEmployee, onCreateShiftDef, onDeleteShiftDef, onResetPin }) {
  const [tab, setTab]             = useState('shifts')
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [emp, setEmp]             = useState(EMPTY_EMP)
  const [submitting, setSubmitting] = useState(false)
  const [inviting, setInviting]   = useState(null)

  const [defLabel, setDefLabel] = useState('')
  const [defStart, setDefStart] = useState('08:00')
  const [defEnd, setDefEnd]     = useState('16:00')
  const [defColor, setDefColor] = useState(COLORS[0])

  function setF(field) { return e => setEmp(prev => ({ ...prev, [field]: e.target.value })) }
  function setD(field) { return v  => setEmp(prev => ({ ...prev, [field]: v })) }

  function openNew() { setEmp(EMPTY_EMP); setEditingId(null); setShowForm(true) }

  function openEdit(employee) {
    setEmp({
      first_name:       employee.first_name || '',
      last_name:        employee.last_name || '',
      role:             employee.role || '',
      contract_pct:     String(employee.contract_pct || 100),
      email:            employee.email || '',
      phone:            employee.phone || '',
      address_street:   employee.address_street || '',
      address_zip:      employee.address_zip || '',
      address_city:     employee.address_city || '',
      address_country:  employee.address_country || 'Suisse',
      birth_date:       employee.birth_date || '',
      hire_date:        employee.hire_date || '',
      contract_type:    employee.contract_type || 'cdi',
      hourly_rate:      employee.hourly_rate != null ? String(employee.hourly_rate) : '',
      avs_number:       employee.avs_number || '',
      weekly_hours_ref: employee.weekly_hours_ref != null ? String(employee.weekly_hours_ref) : '42',
      monthly_salary:   employee.monthly_salary != null ? String(employee.monthly_salary) : '',
    })
    setEditingId(employee.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() { setShowForm(false); setEmp(EMPTY_EMP); setEditingId(null) }

  async function submitDef(e) {
    e.preventDefault()
    if (!defLabel.trim()) return
    await onCreateShiftDef({ label: defLabel.trim(), start_time: defStart, end_time: defEnd, color: defColor })
    setDefLabel(''); setDefStart('08:00'); setDefEnd('16:00'); setDefColor(COLORS[0])
  }

  function buildPayload() {
    return {
      first_name:       emp.first_name.trim(),
      last_name:        emp.last_name.trim(),
      role:             emp.role.trim() || null,
      contract_pct:     parseInt(emp.contract_pct) || 100,
      email:            emp.email.trim() || null,
      phone:            emp.phone.trim() || null,
      address_street:   emp.address_street.trim() || null,
      address_zip:      emp.address_zip.trim() || null,
      address_city:     emp.address_city.trim() || null,
      address_country:  emp.address_country.trim() || null,
      birth_date:       emp.birth_date || null,
      hire_date:        emp.hire_date || null,
      contract_type:    emp.contract_type || 'cdi',
      hourly_rate:      emp.hourly_rate ? parseFloat(emp.hourly_rate) : null,
      avs_number:       emp.avs_number.trim() || null,
      weekly_hours_ref: emp.weekly_hours_ref ? parseFloat(emp.weekly_hours_ref) : null,
      monthly_salary:   emp.monthly_salary ? parseFloat(emp.monthly_salary) : null,
    }
  }

  async function submitEmp(e) {
    e.preventDefault()
    if (!emp.first_name.trim() || !emp.last_name.trim()) return
    setSubmitting(true)
    try {
      if (editingId) {
        if (onUpdateEmployee) await onUpdateEmployee(editingId, buildPayload())
        else await supabase.from('employees').update(buildPayload()).eq('id', editingId)
      } else {
        await onCreateEmployee(buildPayload())
      }
      closeForm()
    } finally {
      setSubmitting(false)
    }
  }

  async function sendInvitation(employee) {
    if (!employee.email) return
    setInviting(employee.id)
    try {
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: { employee_id: employee.id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      onUpdateEmployee(employee.id, { invitation_sent_at: new Date().toISOString() })
      alert(`Invitation envoyée à ${employee.email}`)
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setInviting(null)
    }
  }

  const canSubmit = emp.first_name.trim() && emp.last_name.trim()

  const TABS = [
    { id: 'shifts',   label: '⚡ Types de shifts' },
    { id: 'plan',     label: '📋 Plan de travail' },
    { id: 'employes', label: '👥 Employés' },
  ]

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 24 }}>Configuration</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--fg2)',
            padding: '8px 16px', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            marginBottom: -1, transition: 'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Types de shifts ── */}
      {tab === 'shifts' && (
        <div>
          <form onSubmit={submitDef} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Nouveau type de shift</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Nom</label>
                <input value={defLabel} onChange={e => setDefLabel(e.target.value)} placeholder="Service midi, Soir, Coupé…" style={inp} />
              </div>
              <div>
                <label style={lbl}>Début</label>
                <input type="time" value={defStart} onChange={e => setDefStart(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Fin</label>
                <input type="time" value={defEnd} onChange={e => setDefEnd(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Couleur</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setDefColor(c)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: defColor === c ? '3px solid white' : '2px solid transparent',
                    cursor: 'pointer', outline: defColor === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 1, transition: 'all .15s',
                  }} />
                ))}
              </div>
            </div>
            {defLabel && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Aperçu</label>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 8px', borderRadius: 8, background: defColor + '22', border: `1px solid ${defColor}55` }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: defColor, display: 'block' }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{defLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg2)' }}>{defStart}–{defEnd}</span>
                </div>
              </div>
            )}
            <button type="submit" disabled={!defLabel.trim()} style={defLabel.trim() ? btnPrimary : btnDisabled}>
              + Ajouter ce type
            </button>
          </form>

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
                  <button onClick={() => onDeleteShiftDef(def.id)} style={btnGhost}>Supprimer</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Plan de travail ── */}
      {tab === 'plan' && <WorkPlanTab shiftDefs={shiftDefs} />}

      {/* ── Employés ── */}
      {tab === 'employes' && (
        <div>
          {!showForm && (
            <button onClick={openNew} style={{ ...btnPrimary, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              + Nouvel employé
            </button>
          )}

          {showForm && (
            <form onSubmit={submitEmp} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>
                  {editingId ? "Modifier l'employé" : 'Nouvel employé'}
                </div>
                <button type="button" onClick={closeForm} style={{ background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>

              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 28 }}>
                <div>
                  <div style={sectionTitle}>Identité</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Prénom *</label><input value={emp.first_name} onChange={setF('first_name')} placeholder="Prénom" style={inp} /></div>
                    <div><label style={lbl}>Nom *</label><input value={emp.last_name} onChange={setF('last_name')} placeholder="Nom de famille" style={inp} /></div>
                    <div>
                      <label style={lbl}>Date de naissance</label>
                      <DatePicker value={emp.birth_date} onChange={setD('birth_date')} minYear={1940} maxYear={new Date().getFullYear() - 14} style={{ width: '100%' }} inputStyle={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div><label style={lbl}>N° AVS</label><input value={emp.avs_number} onChange={setF('avs_number')} placeholder="756.XXXX.XXXX.XX" style={inp} /></div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)' }} />

                <div>
                  <div style={sectionTitle}>Contact</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Email</label><input type="email" value={emp.email} onChange={setF('email')} placeholder="email@exemple.com" style={inp} /></div>
                    <div><label style={lbl}>Téléphone</label><input type="tel" value={emp.phone} onChange={setF('phone')} placeholder="+41 79 123 45 67" style={inp} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Rue et numéro</label><input value={emp.address_street} onChange={setF('address_street')} placeholder="Rue et numéro" style={inp} /></div>
                    <div><label style={lbl}>NPA</label><input value={emp.address_zip} onChange={setF('address_zip')} placeholder="1201" style={inp} /></div>
                    <div><label style={lbl}>Ville</label><input value={emp.address_city} onChange={setF('address_city')} placeholder="Genève" style={inp} /></div>
                    <div><label style={lbl}>Pays</label><input value={emp.address_country} onChange={setF('address_country')} placeholder="Suisse" style={inp} /></div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)' }} />

                <div>
                  <div style={sectionTitle}>Contrat</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Poste / Rôle</label><input value={emp.role} onChange={setF('role')} placeholder="Chef de rang, Cuisinier…" style={inp} /></div>
                    <div>
                      <label style={lbl}>Type de contrat</label>
                      <select value={emp.contract_type} onChange={setF('contract_type')} style={inp}>
                        {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    {(emp.contract_type === 'cdi' || emp.contract_type === 'cdd') && <ContratFixeFields emp={emp} setF={setF} />}
                    {(emp.contract_type === 'cdi_horaire' || emp.contract_type === 'cdd_horaire') && (
                      <div><label style={lbl}>Taux d'occupation (%)</label><input type="number" min="10" max="100" value={emp.contract_pct} onChange={setF('contract_pct')} style={inp} /></div>
                    )}
                    <div><label style={lbl}>Salaire brut mensuel (CHF)</label><input type="number" step="1" min="0" value={emp.monthly_salary} onChange={setF('monthly_salary')} placeholder="4500" style={inp} /></div>
                    <div><label style={lbl}>Taux horaire (CHF)</label><input type="number" step="0.05" min="0" value={emp.hourly_rate} onChange={setF('hourly_rate')} placeholder="23.50" style={inp} /></div>
                    <div>
                      <label style={lbl}>Date d'entrée</label>
                      <DatePicker value={emp.hire_date} onChange={setD('hire_date')} minYear={2000} maxYear={new Date().getFullYear() + 1} style={{ width: '100%' }} inputStyle={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>

                    {/* Taux par rôle */}
                    {editingId ? (
                      <EmployeeRates employeeId={editingId} shiftDefs={shiftDefs} />
                    ) : (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 12, color: 'var(--fg3)', background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          💡 Les taux horaires par type de shift seront disponibles après la création de l'employé
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
                  {canSubmit ? `${emp.first_name} ${emp.last_name}${emp.email ? ' · ' + emp.email : ''}` : '* Prénom et nom requis'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeForm} style={btnGhost}>Annuler</button>
                  <button type="submit" disabled={!canSubmit || submitting} style={canSubmit && !submitting ? btnPrimary : btnDisabled}>
                    {submitting ? '…' : editingId ? '✓ Enregistrer' : "+ Créer l'employé"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {employees.length === 0 && !showForm ? (
            <div style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: 40 }}>Aucun employé — clique sur "+ Nouvel employé" ci-dessus</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {employees.map(e => (
                <div key={e.id} style={{ background: 'var(--bg2)', border: editingId === e.id ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', transition: 'border-color .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
                      {e.first_name[0]}{e.last_name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{e.first_name} {e.last_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {e.role && <span>{e.role}</span>}
                        {e.contract_type && <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{CONTRACT_LABEL[e.contract_type] || e.contract_type}</span>}
                        {e.email && <span style={{ color: 'var(--fg3)' }}>{e.email}</span>}
                        {e.phone && <span style={{ color: 'var(--fg3)' }}>{e.phone}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--fg2)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>{e.contract_pct}%</span>
                    <span style={{ fontSize: 11, color: e.pin_hash ? 'var(--accent)' : 'var(--fg3)', background: e.pin_hash ? 'var(--accent-dim)' : 'var(--bg3)', padding: '3px 10px', borderRadius: 20, fontFamily: 'monospace', flexShrink: 0 }}>
                      {e.pin_hash ? '🔑 PIN ✓' : '🔑 sans PIN'}
                    </span>
                    <button onClick={() => openEdit(e)} style={{ ...btnGhost, color: 'var(--accent)', borderColor: 'var(--accent)44' }}>✏️ Modifier</button>
                    {onResetPin && <button onClick={() => onResetPin(e.id)} style={btnGhost}>🔄 PIN</button>}
                    <button onClick={() => onDeleteEmployee(e.id)} style={btnGhost}>Supprimer</button>
                  </div>
                  {e.email && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 11, color: 'var(--fg3)' }}>
                        {e.invitation_sent_at
                          ? `✉️ Invitation envoyée le ${new Date(e.invitation_sent_at).toLocaleDateString('fr-CH')}`
                          : e.auth_user_id ? '✅ Compte actif' : '⚠️ Compte employé non créé'}
                      </div>
                      {!e.auth_user_id && (
                        <button onClick={() => sendInvitation(e)} disabled={inviting === e.id} style={{ ...btnGhost, color: 'var(--fg)', fontWeight: 600 }}>
                          {inviting === e.id ? '…' : "✉️ Envoyer l'invitation"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
