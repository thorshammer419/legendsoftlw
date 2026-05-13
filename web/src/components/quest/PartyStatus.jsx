export default function PartyStatus({ partyStatus, submitted }) {
  return (
    <div>
      <div className="section-header">Party</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {partyStatus.map((p) => (
          <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: p.submitted ? 'var(--success)' : 'var(--border-light)',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: p.submitted ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>
              {p.email.split('@')[0]}
            </span>
            {p.submitted && <span style={{ fontSize: 11, color: 'var(--success)' }}>Ready</span>}
          </div>
        ))}
      </div>
      {submitted && (
        <p style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic', color: 'var(--gold)' }}>
          Awaiting the others...
        </p>
      )}
    </div>
  );
}
