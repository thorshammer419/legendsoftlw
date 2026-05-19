import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import PlayerCard from '../components/admin/PlayerCard';
import { useCampaign } from '../hooks/useCampaign';
import { useNavbar } from '../context/NavbarContext';

export default function Admin({ user, isAdmin }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { setCenterContent } = useNavbar();
  const { campaign, players, loading, error, refresh } = useCampaign(campaignId);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notification, setNotification] = useState(null);
  const [allowedUsers, setAllowedUsers] = useState(null);
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [allowlistWorking, setAllowlistWorking] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordWorking, setPasswordWorking] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [rerollFlags, setRerollFlags] = useState(null);
  const [confirmRemoveFlag, setConfirmRemoveFlag] = useState(null);
  const [removingFlag, setRemovingFlag] = useState(false);

  useEffect(() => {
    api.getAllowedUsers()
      .then(setAllowedUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.getRerollFlags(campaignId)
      .then(setRerollFlags)
      .catch(() => {});
  }, [campaignId]);

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
      navigate('/');
    } catch (err) {
      notify(`Error: ${err.message}`);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const addAllowedUser = async () => {
    const email = newAllowedEmail.trim();
    if (!email) return;
    setAllowlistWorking(true);
    try {
      await api.addAllowedUser(email);
      const updated = await api.getAllowedUsers();
      setAllowedUsers(updated);
      setNewAllowedEmail('');
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setAllowlistWorking(false);
    }
  };

  const removeAllowedUser = async (email) => {
    setAllowlistWorking(true);
    try {
      await api.removeAllowedUser(email);
      const updated = await api.getAllowedUsers();
      setAllowedUsers(updated);
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setAllowlistWorking(false);
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

  const updatePassword = async (password) => {
    setPasswordWorking(true);
    try {
      await api.updateCampaignPassword(campaignId, password);
      setNewPassword('');
      notify(password.trim() ? 'Password updated.' : 'Password removed.');
      refresh();
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setPasswordWorking(false);
    }
  };

  const regenerateInvite = async () => {
    setRegenerating(true);
    try {
      await api.regenerateInviteToken(campaignId);
      notify('Invite link regenerated. Old link is now invalid.');
      refresh();
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const removeRerollFlag = async (playerEmail) => {
    setRemovingFlag(true);
    try {
      await api.removeRerollFlag(campaignId, playerEmail);
      setRerollFlags((prev) => prev.filter((f) => f.email !== playerEmail));
      setConfirmRemoveFlag(null);
      notify('Reroll flag removed.');
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setRemovingFlag(false);
    }
  };

  useEffect(() => {
    if (!campaign) return;
    setCenterContent(
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => navigate(`/game/${campaignId}`)}
      >
        Enter Game
      </button>
    );
    return () => setCenterContent(null);
  }, [campaign, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (error || (campaign && !isAdmin(campaign))) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
        <h2>{error ? 'Could not load campaign' : 'Access denied'}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          {error || 'Only the campaign creator can access this page.'}
        </p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  const inviteUrl = campaign?.invite_token
    ? `${window.location.origin}/campaigns/invite/${campaign.invite_token}`
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '84px 24px 24px' }}>

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

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0 }}>{campaign?.name}</h1>
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

          {inviteUrl && (
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
                  onClick={() => { navigator.clipboard.writeText(inviteUrl); notify('Invite link copied!'); }}
                >
                  Copy
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={regenerateInvite}
                  disabled={regenerating}
                  title="Generate a new link — old link stops working immediately"
                >
                  {regenerating ? '...' : 'Regenerate'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                Anyone with this link can join without entering a password. Regenerate to invalidate the old link.
              </p>
            </div>
          )}
        </div>

        {/* Campaign Settings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Campaign Settings</h3>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {campaign?.password_hash
                ? <span style={{ color: 'var(--gold)' }}>🔒 Password protected</span>
                : <span style={{ color: 'var(--text-muted)' }}>Open — no password required</span>
              }
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: campaign?.password_hash ? 8 : 0 }}>
              <input
                type="password"
                placeholder={campaign?.password_hash ? 'Set new password...' : 'Add a password...'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={passwordWorking}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => updatePassword(newPassword)}
                disabled={passwordWorking || !newPassword.trim()}
              >
                {passwordWorking ? 'Saving...' : 'Set'}
              </button>
            </div>
            {campaign?.password_hash && (
              <button
                className="btn btn-sm"
                style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '4px 12px' }}
                onClick={() => updatePassword('')}
                disabled={passwordWorking}
              >
                Remove Password
              </button>
            )}
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

        {/* Access control — only visible to system admins (null = not loaded, [] = loaded but empty) */}
        {allowedUsers !== null && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Access Control</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Only users on this list may log in. Removing a user revokes their access immediately.
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="Add email address..."
                value={newAllowedEmail}
                onChange={(e) => setNewAllowedEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAllowedUser()}
                style={{ flex: 1, fontSize: 13 }}
                disabled={allowlistWorking}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={addAllowedUser}
                disabled={allowlistWorking || !newAllowedEmail.trim()}
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
                      disabled={allowlistWorking}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reroll Flags — only visible to system admins */}
        {rerollFlags !== null && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Reroll Flags</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Players who have been granted a reroll. Removing a flag lets them reroll again if approved.
            </p>
            {rerollFlags.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No active reroll flags.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rerollFlags.map((f) => (
                  <div key={f.email} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={f.email}>{f.display_name || f.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {f.char_name} · {f.char_class}
                      </div>
                    </div>
                    {confirmRemoveFlag === f.email ? (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--danger)', color: '#fff', padding: '2px 10px' }}
                          onClick={() => removeRerollFlag(f.email)}
                          disabled={removingFlag}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '2px 10px' }}
                          onClick={() => setConfirmRemoveFlag(null)}
                          disabled={removingFlag}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm"
                        style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '2px 10px', flexShrink: 0 }}
                        onClick={() => setConfirmRemoveFlag(f.email)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
    </div>
  );
}
