import { useEffect, useRef } from 'react';
import RoundMarker from './RoundMarker';

export default function NarrativeFeed({ feed, submitted, partyStatus }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed]);

  return (
    <div className="scroll" style={{ flex: 1, padding: '16px 20px' }}>
      {feed.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🐉</div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-secondary)' }}>
            Your adventure begins...
          </p>
        </div>
      )}

      {feed.map((entry, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <RoundMarker round={entry.round_number} />

          {entry.scene_image_url && (
            <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
              <img
                src={entry.scene_image_url}
                alt="Scene"
                style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }}
                loading="lazy"
              />
            </div>
          )}

          <p className="narrative-text" style={{ whiteSpace: 'pre-wrap' }}>{entry.narrative}</p>
        </div>
      ))}

      {feed.length > 0 && (
        <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div className="section-header" style={{ marginBottom: 8 }}>Waiting for actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {partyStatus.map((p) => (
              <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ color: p.submitted ? 'var(--success)' : 'var(--text-muted)' }}>
                  {p.submitted ? '✓' : '○'}
                </span>
                <span style={{ color: p.submitted ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {p.email.split('@')[0]}
                </span>
              </div>
            ))}
          </div>
          {submitted && (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--gold)', fontStyle: 'italic' }}>
              Your action has been submitted. Waiting for the other adventurers...
            </p>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
