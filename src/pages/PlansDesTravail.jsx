import { useState } from 'react'

export default function PlansDesTravail({ site, templates, onDeleteTemplate }) {
  const [confirmId, setConfirmId] = useState(null)

  function handleDelete(id) {
    if (confirmId === id) {
      onDeleteTemplate(id)
      setConfirmId(null)
    } else {
      setConfirmId(id)
      setTimeout(() => setConfirmId(null), 3000)
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Plans de travail</div>
      <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 28 }}>
        Semaines types sauvegardées depuis le planning. Tu peux les appliquer en bas du planning.
      </div>

      {!templates || templates.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 12, color: 'var(--fg3)', textAlign: 'center' }}>
          <span style={{ fontSize: 48 }}>📋</span>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Aucun plan sauvegardé</div>
          <div style={{ fontSize: 13 }}>Va dans le planning et clique sur <strong style={{ color: 'var(--fg2)' }}>💾 Sauver cette semaine comme plan</strong></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(tpl => {
            const slotCount = tpl.week_template_slots?.length || 0
            const isConfirm = confirmId === tpl.id
            return (
              <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg2)', border: isConfirm ? '1px solid #f87171' : '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', transition: 'border-color .2s' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
                    {slotCount} shift{slotCount !== 1 ? 's' : ''} planifié{slotCount !== 1 ? 's' : ''}
                    {tpl.created_at && (
                      <span style={{ marginLeft: 10, opacity: 0.7 }}>· {new Date(tpl.created_at).toLocaleDateString('fr-CH')}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(tpl.id)}
                  style={{
                    background: isConfirm ? '#f87171' : 'none',
                    border: isConfirm ? '1px solid #f87171' : '1px solid var(--border)',
                    color: isConfirm ? '#fff' : 'var(--fg3)',
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    fontWeight: isConfirm ? 600 : 400, transition: 'all .2s',
                  }}
                >
                  {isConfirm ? 'Confirmer ?' : 'Supprimer'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
