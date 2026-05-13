const CONDITION_COLORS = {
  Poisoned: 'badge-red', Blinded: 'badge-gray', Charmed: 'badge-gold',
  Deafened: 'badge-gray', Exhaustion: 'badge-red', Frightened: 'badge-red',
  Grappled: 'badge-gray', Incapacitated: 'badge-red', Invisible: 'badge-gold',
  Paralyzed: 'badge-red', Petrified: 'badge-gray', Prone: 'badge-gray',
  Restrained: 'badge-gray', Stunned: 'badge-red', Unconscious: 'badge-red',
};

export default function ConditionBadge({ condition }) {
  const cls = CONDITION_COLORS[condition] || 'badge-gray';
  return <span className={`badge ${cls}`}>{condition}</span>;
}
