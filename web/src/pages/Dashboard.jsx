import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/auth';
import { api } from '../services/api';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAccessControl, setShowAccessControl] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [acWorking, setAcWorking] = useState(false);
  const [acNotification, setAcNotification] = useState(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('my_campaigns') || '[]');
    setCampaigns(stored);
    setLoading(false);
  }, []);

  const openAccessControl = async () => {
    setShowAccessControl(true);
    try {
      setAllowedUsers(await api.getAllowedUsers());
    } catch (err) {
      acNotify(`Error loading list: ${err.message || err.status || 'unknown'}`);
    }
  };

  const acNotify = (msg) => {
    setAcNotification(msg);
    setTimeout(() => setAcNotification(null), 3000);
  };

  const addAllowedUser = async () => {
    const email = newEmail.trim();
    if (!email) return;
    setAcWorking(true);
    try {
      await api.addAllowedUser(email);
      setAllowedUsers(await api.getAllowedUsers());
      setNewEmail('');
      acNotify(`${email} added.`);
    } catch (err) {
      acNotify(`Error: ${err.message}`);
    } finally {
      setAcWorking(false);
    }
  };

  const removeAllowedUser = async (email) => {
    setAcWorking(true);
    try {
      await api.removeAllowedUser(email);
      setAllowedUsers(await api.getAllowedUsers());
      acNotify(`${email} removed.`);
    } catch (err) {
      acNotify(`Error: ${err.message}`);
    } finally {
      setAcWorking(false);
    }
  };

  const displayName = user?.display_name || user?.userDetails?.split('@')[0] || 'Adventurer';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Welcome, {displayName}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your campaigns</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {user?.is_system_admin && (
            <button className="btn btn-secondary btn-sm" onClick={openAccessControl}>Access Control</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>

      {showAccessControl && (
        <div className="card" style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Access Control</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAccessControl(false)}>✕ Close</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Only users on this list may log in. Removing a user revokes their access immediately.
          </p>

          {acNotification && (
            <div style={{ fontSize: 13, padding: '8px 12px', background: 'rgba(184,146,48,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gold)', color: 'var(--text-primary)' }}>
              {acNotification}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              placeholder="Add email address..."
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAllowedUser()}
              style={{ flex: 1, fontSize: 13 }}
              disabled={acWorking}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={addAllowedUser}
              disabled={acWorking || !newEmail.trim()}
            >
              Add
            </button>
          </div>

          {allowedUsers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No users on the allowlist.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allowedUsers.map((u) => (
                <div key={u.email} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}>
                  <span style={{
                    fontSize: 13, color: 'var(--text-primary)',
                    flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={u.email}>{u.email}</span>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '2px 10px', flexShrink: 0 }}
                    onClick={() => removeAllowedUser(u.email)}
                    disabled={acWorking}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
