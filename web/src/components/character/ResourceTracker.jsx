export default function ResourceTracker({ character }) {
  if (!character) return null;
  const { hp, spell_slots, class_features } = character;
  const hpPct = hp ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
  const hpColor = hpPct > 50 ? 'var(--success)' : hpPct > 25 ? 'var(--warning)' : 'var(--danger)';

  const trackableFeatures = (class_features || []).filter((f) => f.uses);
  const slots = spell_slots || {};
  const slotLevels = Object.keys(slots).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* HP */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hit Points</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: hpColor }}>
            {hp?.current ?? '—'} / {hp?.max ?? '—'}
            {hp?.temp > 0 && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>+{hp.temp}</span>}
          </span>
        </div>
        <div className="hp-bar">
          <div className="hp-bar-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* Spell slots */}
      {slotLevels.length > 0 && (
        <div>
          <div className="section-header">Spell Slots</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {slotLevels.map((lvl) => {
              const slot = slots[lvl];
              return (
                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{lvl}:</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: slot.total || 0 }).map((_, i) => (
                      <div key={i} style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: i < (slot.remaining || 0) ? 'var(--gold)' : 'var(--border)',
                        border: '1px solid var(--border-light)',
                      }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Class features with uses */}
      {trackableFeatures.length > 0 && (
        <div>
          <div className="section-header">Abilities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {trackableFeatures.map((f) => (
              <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{f.name}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: f.uses.total || 0 }).map((_, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i < (f.uses.remaining || 0) ? 'var(--accent)' : 'var(--border)',
                      border: '1px solid var(--border-light)',
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
