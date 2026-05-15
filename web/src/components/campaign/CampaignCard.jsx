import { useNavigate } from 'react-router-dom';

export default function CampaignCard({ campaign, onJoin, joining = false }) {
  const navigate = useNavigate();

  if (campaign.is_member) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
          onClick={() => {
            if (campaign.status === 'lobby') navigate(`/campaigns/${campaign.campaign_id}/lobby`);
            else navigate(`/game/${campaign.campaign_id}`);
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{campaign.name}</div>
          {campaign.party_name && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{campaign.party_name}</div>
          )}
        </div>
        <span className={`badge ${campaign.status === 'active' ? 'badge-green' : 'badge-gold'}`}>
          {campaign.status === 'lobby' ? 'in lobby' : campaign.status}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          title="Manage campaign"
          onClick={() => navigate(`/campaigns/${campaign.campaign_id}/admin`)}
          style={{ padding: '4px 8px', flexShrink: 0 }}
        >
          ⚙
        </button>
      </div>
    );
  }

  const isFull = campaign.player_count >= campaign.max_players;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{campaign.name}</div>
          {campaign.party_name && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{campaign.party_name}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {campaign.is_password_protected && (
            <span title="Password protected" style={{ fontSize: 14, opacity: 0.8 }}>🔒</span>
          )}
          <span className={`badge ${campaign.status === 'active' ? 'badge-green' : 'badge-gold'}`}>
            {campaign.status === 'lobby' ? 'Lobby' : 'Active'}
          </span>
        </div>
      </div>

      {campaign.description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          {campaign.description}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span>{campaign.player_count}/{campaign.max_players} players</span>
          <span style={{ margin: '0 6px' }}>·</span>
          <span>by {campaign.creator_display_name}</span>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onJoin(campaign)}
          disabled={isFull || joining}
        >
          {isFull ? 'Full' : joining ? 'Joining...' : 'Join'}
        </button>
      </div>
    </div>
  );
}
