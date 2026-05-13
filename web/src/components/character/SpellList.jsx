export default function SpellList({ character, onSelectSpell, actionEconomy }) {
  const spells = character?.spells_known || [];
  const slots = character?.spell_slots || {};
  if (spells.length === 0) return null;

  const byLevel = spells.reduce((acc, spell) => {
    const lvl = spell.level || 0;
    if (!acc[lvl]) acc[lvl] = [];
    acc[lvl].push(spell);
    return acc;
  }, {});

  return (
    <div>
      <div className="section-header">Spells</div>
      {Object.keys(byLevel).sort((a, b) => a - b).map((lvl) => {
        const slot = slots[`${lvl}th`] || slots[lvl] || null;
        const hasSlot = !slot || (slot.remaining || 0) > 0;
        return (
          <div key={lvl} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {lvl === '0' ? 'Cantrips' : `Level ${lvl}`}
              {slot && <span style={{ marginLeft: 8, color: hasSlot ? 'var(--gold)' : 'var(--text-muted)' }}>({slot.remaining}/{slot.total} slots)</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {byLevel[lvl].map((spell) => {
                const disabled = lvl !== '0' && !hasSlot;
                return (
                  <button
                    key={spell.name}
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'flex-start', opacity: disabled ? 0.4 : 1 }}
                    disabled={disabled || actionEconomy?.action_used}
                    onClick={() => onSelectSpell?.(spell)}
                  >
                    {spell.name}
                    {spell.concentration && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--gold)' }}>C</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
