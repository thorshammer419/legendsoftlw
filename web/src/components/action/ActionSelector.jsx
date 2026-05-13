const STATIC_ACTIONS = [
  { action: 'Attack', type: 'attack', description: 'Make a weapon attack', requires_target: true },
  { action: 'Dodge', type: 'action', description: 'Impose disadvantage on attacks against you' },
  { action: 'Dash', type: 'action', description: 'Double your movement speed' },
  { action: 'Disengage', type: 'action', description: 'Move without provoking opportunity attacks' },
  { action: 'Help', type: 'action', description: 'Give an ally advantage on their next check', requires_target: true },
  { action: 'Hide', type: 'action', description: 'Attempt to hide', dice: [{ die: 'd20', count: 1, purpose: 'Stealth check' }] },
  { action: 'Grapple', type: 'attack', description: 'Attempt to grapple a creature', requires_target: true, dice: [{ die: 'd20', count: 1, purpose: 'Athletics check' }] },
  { action: 'Shove', type: 'attack', description: 'Shove a creature prone or away', requires_target: true, dice: [{ die: 'd20', count: 1, purpose: 'Athletics check' }] },
];

export default function ActionSelector({ actionList, submitted, onSelect, onFreeform }) {
  if (submitted) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <p style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>Action submitted</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Waiting for other adventurers...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Contextual actions from AI */}
      {actionList?.length > 0 && (
        <div>
          <div className="section-header">Suggested</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actionList.map((a) => (
              <button
                key={a.action}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => onSelect?.(a)}
              >
                <span style={{ color: 'var(--gold)', marginRight: 4 }}>✦</span>
                {a.action}
                {a.spell_slot && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Slot {a.spell_slot}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Static actions */}
      <div>
        <div className="section-header">Standard Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {STATIC_ACTIONS.map((a) => (
            <button key={a.action} className="btn btn-secondary btn-sm" onClick={() => onSelect?.(a)}>
              {a.action}
            </button>
          ))}
        </div>
      </div>

      {/* Freeform */}
      <button className="btn btn-ghost btn-full" onClick={onFreeform} style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 12 }}>
        ✏ Describe a custom action...
      </button>
    </div>
  );
}
