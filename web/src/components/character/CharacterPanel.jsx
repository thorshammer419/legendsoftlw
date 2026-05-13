import ConditionBadge from './ConditionBadge';
import ResourceTracker from './ResourceTracker';
import ActionList from './ActionList';
import SpellList from './SpellList';

const ABILITY_SHORT = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export default function CharacterPanel({ character, actionEconomy, onSelectAction }) {
  if (!character) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
      No character found.
    </div>
  );

  const { name, race, class: cls, level, armor_class, speed, ability_scores, conditions, equipment } = character;

  return (
    <div className="scroll" style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ marginBottom: 2 }}>{name}</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {race} {cls} · Level {level}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['AC', armor_class], ['SPD', `${speed}ft`]].map(([label, val]) => (
          <div key={label} className="card" style={{ flex: 1, textAlign: 'center', padding: '8px 4px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Ability scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {Object.entries(ABILITY_SHORT).map(([key, short]) => (
          <div key={key} className="card" style={{ textAlign: 'center', padding: '6px 4px' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{mod(ability_scores?.[key] ?? 10)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{short}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ability_scores?.[key] ?? 10}</div>
          </div>
        ))}
      </div>

      {/* Resources */}
      <ResourceTracker character={character} />

      {/* Conditions */}
      {conditions?.length > 0 && (
        <div>
          <div className="section-header">Conditions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {conditions.map((c) => <ConditionBadge key={c} condition={c} />)}
          </div>
        </div>
      )}

      {/* Actions */}
      <ActionList character={character} actionEconomy={actionEconomy} onSelect={onSelectAction} />

      {/* Spells */}
      <SpellList character={character} actionEconomy={actionEconomy} onSelectSpell={onSelectAction} />

      {/* Equipment */}
      {equipment?.filter((e) => e.equipped).length > 0 && (
        <div>
          <div className="section-header">Equipped</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {equipment.filter((e) => e.equipped).map((e) => e.name).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
