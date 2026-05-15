import { useState } from 'react';

export default function PlayerCard({ player, campaignId, onToggle }) {
  const [loading, setLoading] = useState(false);
  const isActive = player.status === 'active';

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggle(player.email, isActive ? 'inactive' : 'active');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{player.email.split('@')[0]}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{player.email}</div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
          <span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
          {player.role === 'creator' && <span className="badge badge-gold">Creator</span>}
        </div>
        {!isActive && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Combat skips: {player.consecutive_combat_skips || 0} · Scene skips: {player.consecutive_scene_skips || 0}
          </div>
        )}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={handleToggle} disabled={loading}>
        {loading ? '...' : isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}
