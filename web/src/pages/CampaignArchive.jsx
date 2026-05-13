import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function CampaignArchive() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [narrative, setNarrative] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [camp, state] = await Promise.all([
          api.getCampaign(campaignId),
          api.getGameState(campaignId),
        ]);
        setCampaign(camp);
        setNarrative(state?.story_state?.narrative_log ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2>Could not load archive</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
        <h1 style={{ margin: 0 }}>{campaign?.name}</h1>
        <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>Completed</span>
      </div>

      {campaign?.description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28, fontStyle: 'italic' }}>
          {campaign.description}
        </p>
      )}

      {narrative.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📜</div>
          <h2 style={{ marginBottom: 8 }}>No narrative recorded</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            The tale of this campaign has yet to be written.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {narrative.map((entry, i) => (
            <NarrativeEntry key={i} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function NarrativeEntry({ entry }) {
  const system = entry.type === 'system' || entry.type === 'intro';

  return (
    <div style={{
      borderLeft: `3px solid ${system ? 'var(--text-muted)' : 'var(--gold)'}`,
      marginLeft: 12,
      paddingLeft: 20,
      paddingBottom: 28,
      position: 'relative',
    }}>
      {/* Timeline dot */}
      <div style={{
        position: 'absolute',
        left: -8,
        top: 4,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: system ? 'var(--bg-secondary)' : 'var(--gold)',
        border: '2px solid var(--border)',
      }} />

      {entry.round != null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Round {entry.round}
        </div>
      )}

      {entry.actions?.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {entry.actions.map((a, ai) => (
            <div key={ai} style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              <span style={{ color: 'var(--gold)', fontStyle: 'normal' }}>{a.character_name}:</span> {a.action_text}
            </div>
          ))}
        </div>
      )}

      <p style={{
        margin: 0,
        lineHeight: 1.8,
        fontSize: 15,
        fontFamily: system ? 'inherit' : 'var(--font-display)',
        color: system ? 'var(--text-muted)' : 'var(--text-primary)',
      }}>
        {entry.narrative || entry.text || entry.content}
      </p>
    </div>
  );
}
