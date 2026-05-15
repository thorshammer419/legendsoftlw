import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function JoinCampaign() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.resolveInviteToken(token)
      .then(setCampaign)
      .catch((err) => setError(err.message || 'Invite link not found or expired'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      await api.joinCampaign(campaign.campaign_id, { invite_token: token });
      navigate(`/campaigns/${campaign.campaign_id}/character`);
    } catch (err) {
      setError(err.message || 'Failed to join campaign');
      setJoining(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (error && !campaign) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
        <h2>Invite Link Invalid</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  if (campaign?.is_member) {
    const destination = campaign.status === 'lobby'
      ? `/campaigns/${campaign.campaign_id}/lobby`
      : `/game/${campaign.campaign_id}`;
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
        <h2>You're already in this campaign</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{campaign.name}</p>
        <button className="btn btn-primary" onClick={() => navigate(destination)}>
          {campaign.status === 'lobby' ? 'Go to Lobby' : 'Enter Game'}
        </button>
      </div>
    );
  }

  const isFull = campaign.player_count >= campaign.max_players;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>You've been invited to join</div>
          <h2 style={{ margin: '0 0 4px' }}>{campaign.name}</h2>
          {campaign.party_name && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{campaign.party_name}</div>
          )}
        </div>

        {campaign.description && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>{campaign.description}</p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)', alignItems: 'center' }}>
          <span>{campaign.player_count}/{campaign.max_players} players</span>
          <span>·</span>
          <span>by {campaign.creator_display_name}</span>
          <span>·</span>
          <span className={`badge ${campaign.status === 'active' ? 'badge-green' : 'badge-gold'}`}>
            {campaign.status === 'lobby' ? 'Lobby' : 'Active'}
          </span>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(233,69,96,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger)' }}>
            {error}
          </div>
        )}

        {isFull ? (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            This campaign is full.
          </div>
        ) : (
          <button className="btn btn-primary btn-full" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Join Campaign →'}
          </button>
        )}
      </div>
    </div>
  );
}
