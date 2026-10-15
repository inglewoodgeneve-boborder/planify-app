import { useState } from 'react'
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
  contract_type: 'cdi', hourly_rate: '', avs_number: '',
}

export default function Config({ site, employees, shiftDefs, onCreateEmployee, onUpdateEmployee, onDeleteEmployee, onCreateShiftDef, onDeleteShiftDef, onResetPin }) {
  const [tab, setTab]           = useState('shifts')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)   // null = création, id = édition
  const [emp, setEmp]           = useState(EMPTY_EMP)
  const [submitting, setSubmitting] = useState(false)
  const [inviting, setInviting] = useState(null)

  // Shift def form
  const [defLabel, setDefLabel] = useState('')
  const [defStart, setDefStart] = useState('08:00')
  const [defEnd, setDefEnd]     = useState('16:00')
  const [defColor, setDefColor] = useState(COLORS[0])

  function setF(field) { return e => setEmp(prev => ({ ...prev, [field]: e.target.value })) }
  function setD(field) { return v => setEmp(prev => ({ ...prev, [field]: v })) }

  function openNew() {
    setEmp(EMPTY_EMP)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(employee) {
    setEmp({
      first_name:      employee.first_name || '',
      last_name:       employee.last_name || '',
      role:            employee.role || '',
      contract_pct:    String(employee.contract_pct || 100),
      email:           employee.email || '',
      phone:           employee.phone || '',
      address_street:  employee.address_street || '',
      address_zip:     employee.address_zip || '',
      address_city:    employee.address_city || '',
      address_country: employee.address_country || 'Suisse',
      birth_date:      employee.birth_date || '',
      hire_date:       employee.hire_date || '',
      contract_type:   employee.contract_type || 'cdi',
      hourly_rate:     employee.hourly_rate != null ? String(employee.hourly_rate) : '',
      avs_number:      employee.avs_number || '',
    })
    setEditingId(employee.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEmp(EMPTY_EMP)
    setEditingId(null)
  }

  async function submitDef(e) {
    e.preventDefault()
    if (!defLabel.trim()) return
    await onCreateShiftDef({ label: defLabel.trim(), start_time: defStart, end_time: defEnd, color: defColor })
    setDefLabel(''); setDefStart('08:00'); setDefEnd('16:00'); setDefColor(COLORS[0])
  }

  function buildPayload() {
    return {
      first_name:      emp.first_name.trim(),
      last_name:       emp.last_name.trim(),
      role:            emp.role.trim() || null,
      contract_pct:    parseInt(emp.contract_pct) || 100,
      email:           emp.email.trim() || null,
      phone:           emp.phone.trim() || null,
      address_street:  emp.address_street.trim() || null,
      address_zip:     emp.address_zip.trim() || null,
      address_city:    emp.address_city.trim() || null,
      address_country: emp.address_country.trim() || null,
      birth_date:      emp.birth_date || null,
      hire_date:       emp.hire_date || null,
      contract_type:   emp.contract_type || 'cdi',
      hourly_rate:     emp.hourly_rate ? parseFloat(emp.hourly_rate) : null,
      avs_number:      emp.avs_number.trim() || null,
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
      const { error } = await supabase.auth.admin.inviteUserByEmail(employee.email, {
        data: { employee_id: employee.id, site_id: employee.site_id },
        redirectTo: `${window.location.origin}/employee`,
      })
      if (error) throw error
      await supabase.from('employees').update({ invitation_sent_at: new Date().toISOString() }).eq('id', employee.id)
      alert(`Invitation envoyée à ${employee.email}`)
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setInviting(null)
    }
  }

  const canSubmit = emp.first_name.trim() && emp.last_name.trim()

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 24 }}>Configuration</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
        {[{ id: 'shifts', label: '⚡ Types de shifts' }, { id: 'employes', label: '👥 Employés' }].map(t => (
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

      {/* ── Employés ── */}
      {tab === 'employes' && (
        <div>

          {/* Bouton d'ouverture */}
          {!showForm && (
            <button onClick={openNew} style={{ ...btnPrimary, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              + Nouvel employé
            </button>
          )}

          {/* Formulaire complet déroulé */}
          {showForm && (
            <form onSubmit={submitEmp} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>
                  {editingId ? 'Modifier l\'employé' : 'Nouvel employé'}
                </div>
                <button type="button" onClick={closeForm} style={{ background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>

              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 28 }}>

                {/* Section Identité */}
                <div>
                  <div style={sectionTitle}>Identité</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Prénom *</label>
                      <input value={emp.first_name} onChange={setF('first_name')} placeholder="Prénom" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Nom *</label>
                      <input value={emp.last_name} onChange={setF('last_name')} placeholder="Nom de famille" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Date de naissance</label>
                      <DatePicker value={emp.birth_date} onChange={setD('birth_date')} minYear={1940} maxYear={new Date().getFullYear() - 14} style={{ width: '100%' }} inputStyle={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={lbl}>N° AVS</label>
                      <input value={emp.avs_number} onChange={setF('avs_number')} placeholder="756.XXXX.XXXX.XX" style={inp} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)' }} />

                {/* Section Contact */}
                <div>
                  <div style={sectionTitle}>Contact</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Email</label>
                      <input type="email" value={emp.email} onChange={setF('email')} placeholder="email@exemple.com" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Téléphone</label>
                      <input type="tel" value={emp.phone} onChange={setF('phone')} placeholder="+41 79 123 45 67" style={inp} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Rue et numéro</label>
                      <input value={emp.address_street} onChange={setF('address_street')} placeholder="Rue et numéro" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>NPA</label>
                      <input value={emp.address_zip} onChange={setF('address_zip')} placeholder="1201" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Ville</label>
                      <input value={emp.address_city} onChange={setF('address_city')} placeholder="Genève" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Pays</label>
                      <input value={emp.address_country} onChange={setF('address_country')} placeholder="Suisse" style={inp} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)' }} />

                {/* Section Contrat */}
                <div>
                  <div style={sectionTitle}>Contrat</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Poste / Rôle</label>
                      <input value={emp.role} onChange={setF('role')} placeholder="Chef de rang, Cuisinier…" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Type de contrat</label>
                      <select value={emp.contract_type} onChange={setF('contract_type')} style={inp}>
                        {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Taux d'occupation (%)</label>
                      <input type="number" min="10" max="100" value={emp.contract_pct} onChange={setF('contract_pct')} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Taux horaire (CHF)</label>
                      <input type="number" step="0.05" min="0" value={emp.hourly_rate} onChange={setF('hourly_rate')} placeholder="23.50" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Date d'entrée</label>
                      <DatePicker value={emp.hire_date} onChange={setD('hire_date')} minYear={2000} maxYear={new Date().getFullYear() + 1} style={{ width: '100%' }} inputStyle={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
                  {canSubmit
                    ? `${emp.first_name} ${emp.last_name}${emp.email ? ' · ' + emp.email : ''}`
                    : '* Prénom et nom requis'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeForm} style={btnGhost}>Annuler</button>
                  <button type="submit" disabled={!canSubmit || submitting} style={canSubmit && !submitting ? btnPrimary : btnDisabled}>
                    {submitting ? '…' : editingId ? '✓ Enregistrer' : '+ Créer l\'employé'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Liste */}
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

const lbl          = { fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
const inp          = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }
const sectionTitle = { fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 14 }
const btnPrimary   = { background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnDisabled  = { background: 'var(--bg3)', border: 'none', color: 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnGhost     = { background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans',sans-serif" }
