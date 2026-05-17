import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useSignalR } from '../hooks/useSignalR';
import { useCampaign } from '../hooks/useCampaign';
import { useNavbar } from '../context/NavbarContext';

const CLASS_COLORS = {
  Barbarian: '#e74c3c',
  Bard: '#9b59b6',
  Cleric: '#f1c40f',
  Druid: '#27ae60',
  Fighter: '#e67e22',
  Monk: '#1abc9c',
  Paladin: '#3498db',
  Ranger: '#2ecc71',
  Rogue: '#95a5a6',
  Sorcerer: '#e91e63',
  Warlock: '#6c3483',
  Wizard: '#2980b9',
};

function classColor(charClass) {
  return CLASS_COLORS[charClass] || 'var(--gold)';
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function Lobby({ user, isAdmin }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { setCenterContent } = useNavbar();

  const { campaign, players, loading, refresh } = useCampaign(campaignId);
  const [messages, setMessages] = useState([]);
  const seenIds = useRef(new Set());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'leave' | 'cancel' | null
  const [actioning, setActioning] = useState(false);
  const chatBottomRef = useRef(null);

  // If campaign already launched, go straight to game
  useEffect(() => {
    if (campaign?.status === 'active') {
      navigate(`/game/${campaignId}`, { replace: true });
    }
  }, [campaign, navigate, campaignId]);

  // Announce join on mount; announce leave on unmount (+ beacon for tab close)
  useEffect(() => {
    if (!campaignId) return;
    api.lobbyPresence(campaignId, 'join').catch(() => {});
    const handleUnload = () => api.lobbyPresenceBeacon(campaignId);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      api.lobbyPresence(campaignId, 'leave').catch(() => {});
    };
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load chat history on mount + poll every 5s as SignalR fallback.
  // Full replace with history on each cycle; preserves any optimistic
  // in-flight messages (sends not yet persisted) at the end of the list.
  useEffect(() => {
    if (!campaignId) return;
    function loadHistory() {
      api.getLobbyChatHistory(campaignId)
        .then(({ messages: history }) => {
          const historyIds = new Set(history.map((m) => m.message_id).filter(Boolean));
          history.forEach((m) => { if (m.message_id) seenIds.current.add(m.message_id); });
          setMessages((prev) => {
            const inFlight = prev.filter((m) => m.optimistic && m.message_id && !historyIds.has(m.message_id));
            return [...history, ...inFlight];
          });
        })
        .catch(() => {});
    }
    loadHistory();
    const id = setInterval(loadHistory, 5000);
    return () => clearInterval(id);
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onLobbyEvent = (event) => {
    if (event.type === 'launched') {
      navigate(`/game/${campaignId}`, { replace: true });
      return;
    }
    if (event.type === 'campaign_deleted') {
      navigate('/', { replace: true });
      return;
    }
    if (event.type === 'player_left') {
      refresh();
      return;
    }
    if (event.type === 'chat') {
      const id = event.message_id;
      if (id && seenIds.current.has(id)) return;
      if (id) seenIds.current.add(id);
      setMessages((prev) => [...prev, event]);
    }
    if (event.type === 'player_ready') {
      refresh();
      setMessages((prev) => [...prev, {
        type: 'system',
        text: `${event.display_name} created their character (${event.char_name}, ${event.char_class}).`,
        timestamp: new Date().toISOString(),
      }]);
    }
  };

  useSignalR(campaignId, { onLobbyEvent });

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');

    const messageId = crypto.randomUUID();
    seenIds.current.add(messageId);
    setMessages((prev) => [...prev, {
      message_id: messageId,
      type: 'chat',
      email: myEmail,
      display_name: 'You',
      text,
      timestamp: new Date().toISOString(),
      optimistic: true,
    }]);

    try {
      await api.sendLobbyMessage(campaignId, text, messageId);
    } catch (err) {
      console.error('Send failed:', err);
      setInput(text);
      seenIds.current.delete(messageId);
      setMessages((prev) => prev.filter((m) => m.message_id !== messageId));
    } finally {
      setSending(false);
    }
  };

  const regenerateInvite = async () => {
    setRegenerating(true);
    try {
      await api.regenerateInviteToken(campaignId);
      refresh();
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      await api.launchCampaign(campaignId);
      // Navigation handled by SignalR 'launched' event
    } catch (err) {
      console.error('Launch failed:', err);
      setLaunching(false);
    }
  };

  const handleConfirmedAction = async () => {
    setActioning(true);
    try {
      if (confirmAction === 'cancel') {
        await api.deleteCampaign(campaignId);
        navigate('/', { replace: true });
      } else {
        await api.leaveCampaign(campaignId);
        navigate('/', { replace: true });
      }
    } catch (err) {
      console.error('Action failed:', err);
      setActioning(false);
      setConfirmAction(null);
    }
  };

  const readyCount = players.filter((p) => p.character_ready).length;
  const creatorEmails = campaign?.creator_emails ?? [];
  const myEmail = user?.userDetails;
  const iAmAdmin = isAdmin ? isAdmin(campaign) : creatorEmails.includes(myEmail);

  // Polling fallback: refresh campaign status every 5s so launch navigates
  // even if SignalR event is missed (cold start, connection not yet established)
  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const totalSteps = iAmAdmin ? 3 : 2;
    const currentStep = iAmAdmin ? 3 : 2;
    setCenterContent(
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>Step {currentStep} of {totalSteps}</span>
        <button
          className="btn btn-sm"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent', fontSize: 11, padding: '2px 6px', whiteSpace: 'nowrap' }}
          onClick={() => setConfirmAction(iAmAdmin ? 'cancel' : 'leave')}
        >
          {iAmAdmin ? 'Cancel' : 'Leave'}
        </button>
      </div>
    );
    return () => setCenterContent(null);
  }, [iAmAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
    <div style={{
      position: 'fixed', inset: 0,
      overflowY: 'auto',
      backgroundImage: 'url(/tlw_lobby_bg.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', textAlign: 'center', padding: '84px 24px 0' }}>
        <h1 style={{ margin: '0 0 4px' }}>{campaign?.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          {campaign?.party_name} · Waiting for adventurers to gather
        </p>
      </div>
    <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto', padding: '24px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Party roster */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Adventurers</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {readyCount}/{players.length} ready
          </span>
        </div>
        {players.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No one has joined yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {players.map((p) => (
              <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{
                  fontSize: 16,
                  color: p.character_ready ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  {p.character_ready ? '✓' : '○'}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>{p.email.split('@')[0]}</span>
                {p.role === 'creator' && (
                  <span style={{ fontSize: 11, color: 'var(--gold)', fontStyle: 'italic' }}>creator</span>
                )}
                {!p.character_ready && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>creating character...</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 240 }}>
        <h3 style={{ margin: 0, color: 'var(--gold)' }}>Lobby Chat</h3>

        <div className="scroll" style={{ height: 'calc(50vh - 120px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              No messages yet. Say hello while you wait!
            </p>
          )}
          {messages.map((m, i) => (
            <div key={m.message_id || i} style={{ fontSize: 13 }}>
              {m.type === 'system' ? (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{m.text}</span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>
                    {formatTime(m.timestamp)}
                  </span>
                  <span style={{ color: classColor(m.char_class), fontWeight: 600 }}>{m.email === myEmail ? 'You' : m.display_name}: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{m.text}</span>
                </>
              )}
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something..."
            style={{ flex: 1 }}
            maxLength={300}
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!input.trim() || sending}>
            Send
          </button>
        </form>
      </div>

      {/* Invite link — creator/admin only */}
      {iAmAdmin && campaign?.invite_token && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Invite Link</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/campaigns/invite/${campaign.invite_token}`}
              style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(
                `${window.location.origin}/campaigns/invite/${campaign.invite_token}`
              )}
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
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            Anyone with this link can join without entering a password.
          </p>
        </div>
      )}

      {/* Launch / waiting */}
      {iAmAdmin ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Ready to Begin?</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Launch the campaign when your party is assembled. The AI Dungeon Master will open the story and introduce the adventurers.
          </p>
          <button
            className="btn btn-primary btn-full"
            onClick={launch}
            disabled={launching || readyCount === 0}
            style={{ marginTop: 4 }}
          >
            {launching ? 'Launching...' : readyCount === 0 ? 'Waiting for at least one character...' : `⚔ Launch Campaign (${readyCount} ${readyCount === 1 ? 'adventurer' : 'adventurers'} ready)`}
          </button>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Waiting for the campaign creator to launch the adventure...
          </p>
        </div>
      )}
    </div>
    </div>

    {/* Confirmation modal */}
    {confirmAction && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--danger)' }}>
            {confirmAction === 'cancel' ? 'Cancel Campaign?' : 'Leave Campaign?'}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            {confirmAction === 'cancel'
              ? 'This will permanently delete the campaign and remove all players. This cannot be undone.'
              : 'You will be removed from this campaign and taken back to the Dashboard.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmAction(null)}
              disabled={actioning}
            >
              Keep Playing
            </button>
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent' }}
              onClick={handleConfirmedAction}
              disabled={actioning}
            >
              {actioning ? 'Working...' : confirmAction === 'cancel' ? 'Yes, Cancel Campaign' : 'Yes, Leave Campaign'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
