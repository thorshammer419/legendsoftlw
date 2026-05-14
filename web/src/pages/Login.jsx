import { login } from '../services/auth';

export default function Login() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: 24,
      backgroundImage: 'url(/tlw_login_background.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Dark overlay so text/buttons stay readable */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)',
      }} />

      <div style={{ position: 'relative', maxWidth: 380, width: '100%', textAlign: 'center' }}>

        {/* Logo — circular, beveled, dark-edge vignette */}
        <div style={{
          width: 200, height: 200,
          margin: '0 auto 24px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid rgba(0,0,0,0.9)',
          boxShadow: [
            '0 0 0 1px rgba(0,0,0,0.8)',
            '0 0 32px rgba(0,0,0,0.9)',
            'inset 0 0 40px rgba(0,0,0,0.55)',
            '0 0 24px rgba(36,23,115,0.5)',
          ].join(', '),
          position: 'relative',
        }}>
          <img
            src="/tlw_logo.jpg"
            alt="The Lords Wrath"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {/* Inner radial darkening for bevel effect */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'radial-gradient(circle, transparent 45%, rgba(0,0,0,0.65) 100%)',
          }} />
        </div>

        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 36,
          color: '#b0b0b0',
          background: 'linear-gradient(180deg, #d0d0d0 0%, #888 50%, #b0b0b0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 6, letterSpacing: 2, fontWeight: 'bold',
          textShadow: 'none',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))',
        }}>
          The Legends of TLW
        </h1>
        <p style={{
          color: '#d0d0d0', marginBottom: 40, fontStyle: 'italic', fontSize: 13,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        }}>
          The untold stories of The Lord's Wrath, and other adventurers of the forgotten realms
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Continue with Google', provider: 'google' },
            { label: 'Continue with Microsoft', provider: 'aad' },
          ].map(({ label, provider }) => (
            <button
              key={provider}
              className="btn btn-full"
              style={{
                fontSize: 15, padding: '13px 20px', borderRadius: 8,
                background: 'linear-gradient(135deg, #241773, #3d2dbc)',
                color: '#fff', border: '1px solid rgba(61,45,188,0.8)',
                boxShadow: [
                  '0 4px 20px rgba(0,0,0,0.8)',
                  '0 8px 32px rgba(0,0,0,0.6)',
                  'inset 0 1px 0 rgba(255,255,255,0.1)',
                ].join(', '),
                fontWeight: 700, letterSpacing: 0.5,
                textShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }}
              onClick={() => login(provider)}
            >
              {label}
            </button>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.45)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          Sign in to begin your adventure.
        </p>
      </div>
    </div>
  );
}
