import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import PlayerCard from '../components/admin/PlayerCard';
import { useCampaign } from '../hooks/useCampaign';

export default function Admin({ user, isAdmin }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { campaign, players, loading, error, refresh } = useCampaign(campaignId);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notification, setNotification] = useState(null);

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const startRound = async () => {
    setStarting(true);
    try {
      await api.startRound(campaignId);
      notify('Round resolution started.');
      refresh();
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setStarting(false);
    }
  };

  const exportNovel = async () => {
    setExporting(true);
    try {
      await api.exportNovel(campaignId);
      notify('Novel export queued — you will receive an email when ready.');
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const deleteCampaign = async () => {
    setDeleting(true);
    try {
      await api.deleteCampaign(campaignId);
      // Remove from localStorage cache
      const stored = JSON.parse(localStorage.getItem('my_campaigns') || '[]');
      localStorage.setItem('my_campaigns', JSON.stringify(stored.filter((c) => c.campaign_id !== campaignId)));
      navigate('/');
    } catch (err) {
      notify(`Error: ${err.message}`);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const togglePlayer = async (email, status) => {
    try {
      await api.togglePlayer(campaignId, email, status);
      refresh();
    } catch (err) {
      notify(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (error || (campaign && !isAdmin(campaign))) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
        <h2>{error ? 'Could not load campaign' : 'Access denied'}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          {error || 'Only campaign admins can access this page.'}
        </p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/game/${campaignId}`;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>

      {notification && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid var(--gold)',
          borderRadius: 'var(--radius)', padding: '10px 16px',
          fontSize: 13, color: 'var(--text-primary)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {notification}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
        <h1 style={{ margin: 0 }}>{campaign?.name}</h1>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate(`/game/${campaignId}`)}
        >
          Enter Game
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Campaign info */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Campaign Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div className="label">Status</div>
              <span className={`badge ${campaign?.status === 'active' ? 'badge-green' : campaign?.status === 'completed' ? 'badge-gold' : 'badge-gray'}`}>
                {campaign?.status ?? 'unknown'}
              </span>
            </div>
            <div>
              <div className="label">Players</div>
              <span style={{ fontSize: 14 }}>{players.length} / {campaign?.max_players ?? '?'}</span>
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 4 }}>Invite Link</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={inviteUrl}
                style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  notify('Invite link copied!');
                }}
              >
                Copy
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              Share this link with players to join the campaign.
            </p>
          </div>
        </div>

        {/* Round control */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Round Control</h3>
          <button className="btn btn-primary btn-full" onClick={startRound} disabled={starting}>
            {starting ? 'Starting...' : '⚔ Force Resolve Round'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Resolves the current round immediately using actions submitted so far.
          </p>
        </div>

        {/* Players */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Players</h3>
          {players.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No players have joined yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map((p) => (
                <PlayerCard key={p.email} player={p} campaignId={campaignId} onToggle={togglePlayer} />
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Export</h3>
          <button className="btn btn-secondary btn-full" onClick={exportNovel} disabled={exporting}>
            {exporting ? 'Exporting...' : '📖 Export Campaign as Novel'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Generates a professionally formatted PDF novel from the campaign narrative. Sent via email when complete.
          </p>
        </div>

        {/* Danger zone */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--danger)' }}>
          <h3 style={{ margin: 0, color: 'var(--danger)' }}>Danger Zone</h3>
          {!confirmDelete ? (
            <>
              <button
                className="btn btn-full"
                style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Campaign
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Permanently removes this campaign. This cannot be undone.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                Are you sure? This will permanently delete "{campaign?.name}" and all its data.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-full"
                  style={{ background: 'var(--danger)', border: 'none', color: '#fff' }}
                  onClick={deleteCampaign}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Yes, delete it'}
                </button>
                <button
                  className="btn btn-secondary btn-full"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
