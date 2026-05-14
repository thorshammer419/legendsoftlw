import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function AccessControl({ user }) {
  const navigate = useNavigate();
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [notification, setNotification] = useState(null);

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    api.getAllowedUsers()
      .then(setAllowedUsers)
      .catch(() => navigate('/'));
  }, [navigate]);

  const addUser = async () => {
    const email = newEmail.trim();
    if (!email) return;
    setWorking(true);
    try {
      await api.addAllowedUser(email);
      const updated = await api.getAllowedUsers();
      setAllowedUsers(updated);
      setNewEmail('');
      notify(`${email} added.`);
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  const removeUser = async (email) => {
    setWorking(true);
    try {
      await api.removeAllowedUser(email);
      const updated = await api.getAllowedUsers();
      setAllowedUsers(updated);
      notify(`${email} removed.`);
    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>

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
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns/new')}>← Back</button>
        <h1 style={{ margin: 0 }}>Access Control</h1>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Only users on this list may log in. Removing a user revokes their access immediately.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            placeholder="Add email address..."
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUser()}
            style={{ flex: 1, fontSize: 13 }}
            disabled={working}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={addUser}
            disabled={working || !newEmail.trim()}
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
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{u.email}</span>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '2px 10px' }}
                  onClick={() => removeUser(u.email)}
                  disabled={working}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
