import { useState } from 'react';
import { api } from '../../services/api';
import PlayerCard from './PlayerCard';

export default function AdminDrawer({ open, onClose, campaignId, campaignPlayers, onRefresh }) {
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const startRound = async () => {
    setStarting(true);
    try {
      await api.startRound(campaignId);
      onRefresh?.();
    } finally {
      setStarting(false);
    }
  };

  const exportNovel = async () => {
    setExporting(true);
    try {
      await api.exportNovel(campaignId);
      alert('Novel export started! You will receive an email when it is ready.');
    } finally {
      setExporting(false);
    }
  };

  const togglePlayer = async (email, status) => {
    await api.togglePlayer(campaignId, email, status);
    onRefresh?.();
  };

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer drawer-right">
        <div className="drawer-header">
          <h3>Admin</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="section-header">Round Control</div>
            <button className="btn btn-primary btn-full" onClick={startRound} disabled={starting}>
              {starting ? 'Starting...' : '⚔ Force Resolve Round'}
            </button>
            <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              Resolves the round immediately with actions submitted so far.
            </p>
          </div>

          <div>
            <div className="section-header">Players</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campaignPlayers.map((p) => (
                <PlayerCard key={p.email} player={p} campaignId={campaignId} onToggle={togglePlayer} />
              ))}
            </div>
          </div>

          <div>
            <div className="section-header">Campaign</div>
            <button className="btn btn-secondary btn-full" onClick={exportNovel} disabled={exporting}>
              {exporting ? 'Exporting...' : '📖 Export as Novel'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
