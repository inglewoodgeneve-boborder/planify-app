import { useState } from 'react'
import DatePicker from '../components/DatePicker'
import { supabase } from '../lib/supabase'

const COLORS = ['#818cf8','#34d399','#f59e0b','#f87171','#38bdf8','#a78bfa','#fb923c','#4ade80','#e879f9','#94a3b8']

const CONTRACT_TYPES = [
  { value: 'cdi',        label: 'CDI — Contrat durée indéterminée' },
  { value: 'cdd',        label: 'CDD — Contrat durée déterminée' },
  { value: 'temporaire', label: 'Temporaire' },
  { value: 'apprenti',   label: 'Apprentissage' },
]

const EMPTY_EMP = {
  first_name: '', last_name: '', role: '', contract_pct: '100',
  email: '', phone: '',
  address_street: '', address_zip: '', address_city: '',
  birth_date: '', hire_date: '',
  contract_type: 'cdi', hourly_rate: '', avs_number: '',
}

export default function Config({ site, employees, shiftDefs, onCreateEmployee, onDeleteEmployee, onCreateShiftDef, onDeleteShiftDef, onResetPin }) {
  const [tab, setTab] = useState('shifts')

  const [defLabel, setDefLabel]   = useState('')
  const [defStart, setDefStart]   = useState('08:00')
  const [defEnd, setDefEnd]       = useState('16:00')
  const [defColor, setDefColor]   = useState(COLORS[0])

  const [emp, setEmp]           = useState(EMPTY_EMP)
  const [section, setSection]   = useState('identite')
  const [submitting, setSubmitting] = useState(false)
  const [inviting, setInviting] = useState(null)

  function setF(field) { return e => setEmp(prev => ({ ...prev, [field]: e.target.value })) }

  async function submitDef(e) {
    e.preventDefault()
    if (!defLabel.trim()) return
    await onCreateShiftDef({ label: defLabel.trim(), start_time: defStart, end_time: defEnd, color: defColor })
    setDefLabel(''); setDefStart('08:00'); setDefEnd('16:00'); setDefColor(COLORS[0])
  }

  async function submitEmp(e) {
    e.preventDefault()
    if (!emp.first_name.trim() || !emp.last_name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        first_name:    emp.first_name.trim(),
        last_name:     emp.last_name.trim(),
        role:          emp.role.trim() || null,
        contract_pct:  parseInt(emp.contract_pct) || 100,
        email:         emp.email.trim() || null,
        phone:         emp.phone.trim() || null,
        address_street: emp.address_street.trim() || null,
        address_zip:   emp.address_zip.trim() || null,
        address_city:  emp.address_city.trim() || null,
        birth_date:    emp.birth_date || null,
        hire_date:     emp.hire_date || null,
        contract_type: emp.contract_type || 'cdi',
        hourly_rate:   emp.hourly_rate ? parseFloat(emp.hourly_rate) : null,
        avs_number:    emp.avs_number.trim() || null,
      }
      await onCreateEmployee(payload)
      setEmp(EMPTY_EMP)
      setSection('identite')
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

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
        {[{ id: 'shifts', label: '⚡ Types de shifts' }, { id: 'employes', label: '👥 Employés' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--fg2)', padding: '8px 16px', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            marginBottom: -1, transition: 'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'shifts' && (
        <div>
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

      {tab === 'employes' && (
        <div>
          <form onSubmit={submitEmp} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>Nouvel employé</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {[['identite','Identité'],['contact','Contact'],['contrat','Contrat']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setSection(id)} style={{
                    background: section === id ? 'var(--accent)' : 'var(--bg3)',
                    border: '1px solid ' + (section === id ? 'var(--accent)' : 'var(--border)'),
                    color: section === id ? '#fff' : 'var(--fg2)',
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: 20 }}>
              {section === 'identite' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Prénom *</label>
                    <input value={emp.first_name} onChange={setF('first_name')} placeholder="Sophie" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom *</label>
                    <input value={emp.last_name} onChange={setF('last_name')} placeholder="Bernard" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Date de naissance</label>
                    <DatePicker value={emp.birth_date} onChange={v => setEmp(p => ({...p, birth_date: v}))} minYear={1940} maxYear={new Date().getFullYear() - 14} style={{ width:'100%' }} inputStyle={{ width:'100%', boxSizing:'border-box' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>N° AVS</label>
                    <input value={emp.avs_number} onChange={setF('avs_number')} placeholder="756.XXXX.XXXX.XX" style={inputStyle} />
                  </div>
                </div>
              )}

              {section === 'contact' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={emp.email} onChange={setF('email')} placeholder="sophie.bernard@email.com" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Téléphone</label>
                    <input type="tel" value={emp.phone} onChange={setF('phone')} placeholder="+41 79 123 45 67" style={inputStyle} />
                  </div>
                  <div />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Rue et numéro</label>
                    <input value={emp.address_street} onChange={setF('address_street')} placeholder="Rue du Mont-Blanc 12" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>NPA</label>
                    <input value={emp.address_zip} onChange={setF('address_zip')} placeholder="1201" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ville</label>
                    <input value={emp.address_city} onChange={setF('address_city')} placeholder="Genève" style={inputStyle} />
                  </div>
                </div>
              )}

              {section === 'contrat' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Poste / Rôle</label>
                    <input value={emp.role} onChange={setF('role')} placeholder="Chef de rang, Cuisinier..." style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Type de contrat</label>
                    <select value={emp.contract_type} onChange={setF('contract_type')} style={inputStyle}>
                      {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Taux d'occupation (%)</label>
                    <input type="number" min="10" max="100" value={emp.contract_pct} onChange={setF('contract_pct')} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Taux horaire (CHF)</label>
                    <input type="number" step="0.05" min="0" value={emp.hourly_rate} onChange={setF('hourly_rate')} placeholder="23.50" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Date d'entrée</label>
                    <DatePicker value={emp.hire_date} onChange={v => setEmp(p => ({...p, hire_date: v}))} minYear={2000} maxYear={new Date().getFullYear() + 1} style={{ width:'100%' }} inputStyle={{ width:'100%', boxSizing:'border-box' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: 'var(--fg3)' }}>
                {!emp.first_name.trim() || !emp.last_name.trim()
                  ? '* Prénom et nom requis'
                  : `${emp.first_name} ${emp.last_name}${emp.email ? ' · ' + emp.email : ''}`}
              </div>
              <button type="submit" disabled={!canSubmit || submitting} style={canSubmit && !submitting ? btnPrimary : btnDisabled}>
                {submitting ? '…' : "+ Créer l'employé"}
              </button>
            </div>
          </form>

          {employees.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: 40 }}>Aucun employé — crée le premier ci-dessus</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {employees.map(emp => (
                <div key={emp.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.first_name} {emp.last_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg2)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {emp.role && <span>{emp.role}</span>}
                        {emp.contract_type && <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{emp.contract_type}</span>}
                        {emp.email && <span style={{ color: 'var(--fg3)' }}>{emp.email}</span>}
                        {emp.phone && <span style={{ color: 'var(--fg3)' }}>{emp.phone}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--fg2)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>{emp.contract_pct}%</span>
                    <span style={{ fontSize: 11, color: emp.pin_hash ? 'var(--accent)' : 'var(--fg3)', background: emp.pin_hash ? 'var(--accent-dim)' : 'var(--bg3)', padding: '3px 10px', borderRadius: 20, fontFamily: 'monospace', flexShrink: 0 }}>
                      {emp.pin_hash ? '🔑 PIN ✓' : '🔑 sans PIN'}
                    </span>
                    {onResetPin && (
                      <button onClick={() => onResetPin(emp.id)} title="Générer un nouveau PIN" style={btnGhost}>🔄 PIN</button>
                    )}
                    <button onClick={() => onDeleteEmployee(emp.id)} style={btnGhost}>Supprimer</button>
                  </div>

                  {emp.email && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 11, color: 'var(--fg3)' }}>
                        {emp.invitation_sent_at
                          ? `✉️ Invitation envoyée le ${new Date(emp.invitation_sent_at).toLocaleDateString('fr-CH')}`
                          : emp.auth_user_id
                            ? '✅ Compte actif'
                            : '⚠️ Compte employé non créé'}
                      </div>
                      {!emp.auth_user_id && (
                        <button
                          onClick={() => sendInvitation(emp)}
                          disabled={inviting === emp.id}
                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          {inviting === emp.id ? '…' : "✉️ Envoyer l'invitation"}
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

const labelStyle = { fontSize: 11, color: 'var(--fg2)', fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
const inputStyle  = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }
const btnPrimary  = { background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnDisabled = { background: 'var(--bg3)', border: 'none', color: 'var(--fg3)', padding: '8px 20px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }
const btnGhost    = { background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans',sans-serif" }
