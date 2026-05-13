export default function QuestLog({ storyState }) {
  const quest = storyState?.quest || {};
  const scene = storyState?.current_scene || {};
  const completed = quest.completed_milestones || [];
  const pending = [];

  if (quest.main_objective && !completed.includes(quest.main_objective)) {
    pending.push(quest.main_objective);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Current scene */}
      {scene.location && (
        <div>
          <div className="section-header">Location</div>
          <p style={{ fontSize: 13, color: 'var(--gold)' }}>{scene.location}</p>
          {scene.description && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {scene.description}
            </p>
          )}
        </div>
      )}

      {/* Scene type */}
      {storyState?.scene_type && (
        <div>
          <span className={`badge ${
            storyState.scene_type === 'combat' ? 'badge-red'
            : storyState.scene_type === 'social' ? 'badge-gold'
            : 'badge-gray'
          }`}>
            {storyState.scene_type}
          </span>
        </div>
      )}

      {/* Threats */}
      {scene.threats?.length > 0 && (
        <div>
          <div className="section-header">Threats</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {scene.threats.map((t, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', gap: 6 }}>
                <span>⚠</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objectives */}
      {(pending.length > 0 || completed.length > 0) && (
        <div>
          <div className="section-header">Objectives</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--gold)' }}>◇</span>
                <span style={{ color: 'var(--text-secondary)' }}>{m}</span>
              </div>
            ))}
            {completed.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, opacity: 0.6 }}>
                <span style={{ color: 'var(--success)' }}>✓</span>
                <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active NPCs */}
      {scene.active_npcs?.length > 0 && (
        <div>
          <div className="section-header">Present</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {scene.active_npcs.map((npc) => (
              <span key={npc} className="badge badge-gray">{npc}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
