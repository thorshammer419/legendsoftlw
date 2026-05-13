export default function ActionList({ character, actionEconomy, onSelect }) {
  if (!character) return null;

  const economy = actionEconomy || {};
  const actions = character.actions || [];
  const bonusActions = character.bonus_actions || [];
  const reactions = character.reactions || [];

  const actionBtn = (item, type) => {
    const used = type === 'action' ? economy.action_used
      : type === 'bonus' ? economy.bonus_action_used
      : economy.reaction_used;
    const hasUses = !item.uses || (item.uses.remaining || 0) > 0;
    const disabled = used || !hasUses;

    return (
      <button
        key={item.name}
        className="btn btn-secondary btn-sm"
        style={{ justifyContent: 'flex-start', width: '100%', opacity: disabled ? 0.4 : 1, marginBottom: 4 }}
        disabled={disabled}
        onClick={() => onSelect?.({ ...item, action_economy_type: type })}
      >
        {item.name}
        {item.uses && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            {item.uses.remaining}/{item.uses.total}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {actions.length > 0 && (
        <div>
          <div className="section-header" style={{ color: economy.action_used ? 'var(--text-muted)' : undefined }}>
            Actions {economy.action_used && '(used)'}
          </div>
          {actions.map((a) => actionBtn(a, 'action'))}
        </div>
      )}
      {bonusActions.length > 0 && (
        <div>
          <div className="section-header" style={{ color: economy.bonus_action_used ? 'var(--text-muted)' : undefined }}>
            Bonus Actions {economy.bonus_action_used && '(used)'}
          </div>
          {bonusActions.map((a) => actionBtn(a, 'bonus'))}
        </div>
      )}
      {reactions.length > 0 && (
        <div>
          <div className="section-header" style={{ color: economy.reaction_used ? 'var(--text-muted)' : undefined }}>
            Reactions {economy.reaction_used && '(used)'}
          </div>
          {reactions.map((a) => actionBtn(a, 'reaction'))}
        </div>
      )}
    </div>
  );
}
