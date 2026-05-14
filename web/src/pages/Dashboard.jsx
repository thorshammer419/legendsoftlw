import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { logout } from '../services/auth';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  // In a real implementation this would fetch the player's campaigns.
  // For now we read from localStorage as a lightweight cache.
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('my_campaigns') || '[]');
    setCampaigns(stored);
    setLoading(false);
  }, []);

  const displayName = user?.display_name || user?.userDetails?.split('@')[0] || 'Adventurer';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Welcome, {displayName}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your campaigns</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user?.is_system_admin && (
            <Link to="/admin/access" className="btn btn-secondary btn-sm">Access Control</Link>
          )}
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : campaigns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <h2 style={{ marginBottom: 8 }}>No campaigns yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>
            Create a new campaign or ask your DM for an invite link.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/campaigns/new')}>
            + Create Campaign
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {campaigns.map((c) => (
              <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => {
                    if (c.status === 'completed') navigate(`/campaigns/${c.campaign_id}/archive`);
                    else if (c.status === 'lobby') navigate(`/campaigns/${c.campaign_id}/lobby`);
                    else navigate(`/game/${c.campaign_id}`);
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.party_name}</div>
                </div>
                <span className={`badge ${c.status === 'active' ? 'badge-green' : c.status === 'lobby' ? 'badge-gold' : c.status === 'completed' ? 'badge-gold' : 'badge-gray'}`}>
                  {c.status === 'lobby' ? 'in lobby' : c.status}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  title="Manage campaign"
                  onClick={(e) => { e.stopPropagation(); navigate(`/campaigns/${c.campaign_id}/admin`); }}
                  style={{ padding: '4px 8px' }}
                >
                  ⚙
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-full" onClick={() => navigate('/campaigns/new')}>
            + Create New Campaign
          </button>
        </>
      )}
    </div>
  );
}
