import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/auth';
import { api } from '../services/api';
import CampaignCard from '../components/campaign/CampaignCard';
import JoinModal from '../components/campaign/JoinModal';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinError, setJoinError] = useState(null);
  const [joinLoading, setJoinLoading] = useState(null);
  const [joinModalCampaign, setJoinModalCampaign] = useState(null);
  const [showAccessControl, setShowAccessControl] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [acWorking, setAcWorking] = useState(false);
  const [acNotification, setAcNotification] = useState(null);

  useEffect(() => {
    api.listAllCampaigns()
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleJoin = async (campaign) => {
    if (campaign.is_password_protected) {
      setJoinModalCampaign(campaign);
      return;
    }
    setJoinLoading(campaign.campaign_id);
    setJoinError(null);
    try {
      await api.joinCampaign(campaign.campaign_id);
      navigate(`/campaigns/${campaign.campaign_id}/character`);
    } catch (err) {
      setJoinError({ id: campaign.campaign_id, message: err.message || 'Failed to join campaign' });
      setJoinLoading(null);
    }
  };

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

  const myCampaigns = campaigns.filter((c) => c.is_member);
  const browseCampaigns = campaigns.filter((c) => !c.is_member);
  const displayName = user?.display_name || user?.userDetails?.split('@')[0] || 'Adventurer';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      overflowY: 'auto',
      backgroundImage: 'url(/tlw_campaign_bg.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      }} />
    {joinModalCampaign && (
      <JoinModal
        campaign={joinModalCampaign}
        onClose={() => setJoinModalCampaign(null)}
        onSuccess={(c) => navigate(`/campaigns/${c.campaign_id}/character`)}
      />
    )}
    <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto', padding: '48px 24px 24px' }}>
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
      ) : (
        <>
          {/* My Campaigns */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>My Campaigns</h2>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/campaigns/new')}>+ New</button>
            </div>
            {myCampaigns.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                  You haven't joined any campaigns yet. Create one or join one below.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myCampaigns.map((c) => (
                  <CampaignCard key={c.campaign_id} campaign={c} onJoin={handleJoin} />
                ))}
              </div>
            )}
          </section>

          {/* Browse */}
          {browseCampaigns.length > 0 && (
            <section>
              <h2 style={{ margin: '0 0 12px' }}>Join a Campaign</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {browseCampaigns.map((c) => (
                  <div key={c.campaign_id}>
                    <CampaignCard
                      campaign={c}
                      onJoin={handleJoin}
                      joining={joinLoading === c.campaign_id}
                    />
                    {joinError?.id === c.campaign_id && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 2px' }}>
                        {joinError.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
    </div>
  );
}
