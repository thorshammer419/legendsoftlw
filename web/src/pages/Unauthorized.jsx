export default function Unauthorized() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: 24,
      backgroundImage: 'url(/tlw_login_background.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)',
      }} />

      <div style={{ position: 'relative', maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 32,
          color: '#b0b0b0',
          background: 'linear-gradient(180deg, #d0d0d0 0%, #888 50%, #b0b0b0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 16, letterSpacing: 2, fontWeight: 'bold',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))',
        }}>
          Access Restricted
        </h1>

        <p style={{
          color: '#d0d0d0', marginBottom: 16, fontSize: 15, lineHeight: 1.6,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        }}>
          Your account has not been approved to access The Legends of TLW.
        </p>

        <p style={{
          color: '#a0a0a0', fontSize: 13, lineHeight: 1.6,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        }}>
          To request access, contact{' '}
          <a
            href="mailto:erickson.mark.a@gmail.com"
            style={{ color: '#9090d0', textDecoration: 'underline' }}
          >
            erickson.mark.a@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}
