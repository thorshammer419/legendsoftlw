import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useSignalR } from '../hooks/useSignalR';
import { useCampaign } from '../hooks/useCampaign';

export default function Lobby({ user, isAdmin }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();

  const { campaign, players, storyState, loading, refresh } = useCampaign(campaignId);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const chatBottomRef = useRef(null);

  // If campaign already launched, go straight to game
  useEffect(() => {
    if (campaign?.status === 'active' && (storyState?.round_number ?? 0) > 0) {
      navigate(`/game/${campaignId}`, { replace: true });
    }
  }, [campaign, storyState, navigate, campaignId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onLobbyEvent = (event) => {
    if (event.type === 'launched') {
      navigate(`/game/${campaignId}`, { replace: true });
      return;
    }
    if (event.type === 'chat') {
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
    try {
      await api.sendLobbyMessage(campaignId, text);
    } catch (err) {
      console.error('Send failed:', err);
      setInput(text);
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

  const readyCount = players.filter((p) => p.character_ready).length;
  const creatorEmails = campaign?.creator_emails ?? [];
  const myEmail = user?.userDetails;
  const iAmAdmin = isAdmin ? isAdmin(campaign) : creatorEmails.includes(myEmail);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
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
    <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
          <h1 style={{ margin: 0 }}>{campaign?.name}</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          {campaign?.party_name} · Waiting for adventurers to gather
        </p>
      </div>

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

        <div className="scroll" style={{ flex: 1, maxHeight: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              No messages yet. Say hello while you wait!
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {m.type === 'system' ? (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{m.text}</span>
              ) : (
                <>
                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{m.display_name}: </span>
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
  );
}
