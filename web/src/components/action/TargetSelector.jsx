export default function TargetSelector({ action, storyState, character, onSelect }) {
  const npcs = storyState?.current_scene?.active_npcs || [];
  const party = storyState?.party?.members || [];

  const targets = [
    ...npcs.map((n) => ({ label: n, type: 'npc' })),
    ...party.filter((e) => e !== character?.email).map((e) => ({ label: e.split('@')[0], type: 'ally' })),
  ];

  if (action?.target_type === 'area') {
    return (
      <div>
        <div className="section-header">Area Target</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {action.description}
        </p>
        <button className="btn btn-primary btn-full" onClick={() => onSelect?.('area')}>
          Confirm Area Effect
        </button>
      </div>
    );
  }

  if (!action?.requires_target || targets.length === 0) {
    return (
      <button className="btn btn-primary btn-full" onClick={() => onSelect?.(null)}>
        Confirm Action
      </button>
    );
  }

  return (
    <div>
      <div className="section-header">Select Target</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {targets.map((t) => (
          <button
            key={t.label}
            className="btn btn-secondary"
            style={{ justifyContent: 'space-between' }}
            onClick={() => onSelect?.(t.label)}
          >
            <span>{t.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
