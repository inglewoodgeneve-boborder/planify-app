import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'

const CONTRACT_TYPES = [
  { value: 'cdi',         label: 'CDI — Fixe durée indéterminée' },
  { value: 'cdd',         label: 'CDD — Fixe durée déterminée' },
  { value: 'cdi_horaire', label: 'CDI horaire' },
  { value: 'cdd_horaire', label: 'CDD horaire' },
]

const EMPTY_EMP = {
  first_name: '', last_name: '', role: '', contract_pct: '100',
  email: '', phone: '',
  address_street: '', address_zip: '', address_city: '', address_country: 'Suisse',
  birth_date: '', hire_date: '',
  contract_type: 'cdi', hourly_rate: '', avs_number: '', weekly_hours_ref: '42', monthly_salary: '',
}

const lbl          = { fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
const inp          = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }
const sectionTitle = { fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 14 }
const btnPrimary   = { background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnDisabled  = { background: 'var(--bg3)', border: 'none', color: 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnGhost     = { background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans',sans-serif" }

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

function EmployeeRates({ employeeId, positions }) {
  const [rates, setRates]     = useState([])
  const [loading, setLoading] = useState(true)
  const [newPos, setNewPos]   = useState('')
  const [newRate, setNewRate] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!employeeId) { setRates([]); setLoading(false); return }
    supabase.from('employee_rates')
      .select('*')
      .eq('employee_id', employeeId)
      .then(({ data }) => { setRates(data || []); setLoading(false) })
  }, [employeeId])

  const available = positions.filter(p => !rates.find(r => r.position_id === p.id))

  async function addRate(e) {
    e.preventDefault()
    if (!newPos || !newRate) return
    setSaving(true)
    const { data, error } = await supabase.from('employee_rates').insert({
      employee_id: employeeId,
      position_id: newPos,
      hourly_rate: parseFloat(newRate),
    }).select().single()
    if (!error && data) { setRates(r => [...r, data]); setNewPos(''); setNewRate('') }
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
      <label style={lbl}>Taux horaires par position</label>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {rates.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg3)' }}>
            Aucun taux spécifique — le taux de base s'applique à toutes les positions
          </div>
        )}
        {rates.map(rate => {
          const pos = positions.find(p => p.id === rate.position_id)
          if (!pos) return null
          return (
            <div key={rate.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{pos.label}</span>
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
            <select value={newPos} onChange={e => setNewPos(e.target.value)} style={{ ...inp, flex: 1, padding: '6px 8px' }}>
              <option value="">— Choisir une position</option>
              {available.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input
              type="number" step="0.05" min="0"
              value={newRate} onChange={e => setNewRate(e.target.value)}
              placeholder="CHF/h"
              style={{ ...inp, width: 90, padding: '6px 8px', fontFamily: "'DM Mono',monospace" }}
            />
            <button type="submit" disabled={!newPos || !newRate || saving}
              style={newPos && newRate && !saving ? { ...btnPrimary, padding: '6px 14px' } : { ...btnDisabled, padding: '6px 14px' }}>
              + Ajouter
            </button>
          </form>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 6 }}>
        💡 Ces taux s'appliquent automatiquement selon la position liée au shift travaillé
      </div>
    </div>
  )
}

/**
 * EmployeeModal — modale "Modifier l'employé" réutilisable depuis Planning et Config
 *
 * Props:
 *   employee  — objet employé à éditer (requis)
 *   onClose   — callback fermeture ()
 *   onSaved   — callback appelé après save (optionnel, pour refresh)
 */
export default function EmployeeModal({ employee, onClose, onSaved }) {
  const [emp, setEmp]             = useState(EMPTY_EMP)
  const [positions, setPositions] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Charger les positions depuis Supabase
  useEffect(() => {
    supabase.from('positions').select('*').order('label')
      .then(({ data }) => setPositions(data || []))
  }, [])

  // Pré-remplir le formulaire quand employee change
  useEffect(() => {
    if (!employee) return
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
  }, [employee])

  function setF(field) { return e => setEmp(prev => ({ ...prev, [field]: e.target.value })) }
  function setD(field) { return v  => setEmp(prev => ({ ...prev, [field]: v })) }

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!emp.first_name.trim() || !emp.last_name.trim()) return
    setSubmitting(true)
    try {
      await supabase.from('employees').update(buildPayload()).eq('id', employee.id)
      onSaved && onSaved()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = emp.first_name.trim() && emp.last_name.trim()

  if (!employee) return null

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14,
          overflow: 'hidden', width: '100%', maxWidth: 680,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>
            Modifier l'employé
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Body scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Identité */}
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

          {/* Contact */}
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

          {/* Contrat */}
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

              {/* Taux par position */}
              <EmployeeRates employeeId={employee.id} positions={positions} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
            {canSubmit ? `${emp.first_name} ${emp.last_name}${emp.email ? ' · ' + emp.email : ''}` : '* Prénom et nom requis'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
            <button type="submit" disabled={!canSubmit || submitting} style={canSubmit && !submitting ? btnPrimary : btnDisabled}>
              {submitting ? '…' : '✓ Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
