import { useLocation, useNavigate } from 'react-router-dom';
import { useNavbar } from '../context/NavbarContext';

const NAVBAR_HEIGHT = 52;

export { NAVBAR_HEIGHT };

export default function Navbar({ muted, onToggleMute }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { centerContent, backOverride } = useNavbar();

  const isHome = location.pathname === '/';

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: NAVBAR_HEIGHT,
      zIndex: 50,
      background: 'rgba(0,0,0,0.75)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
    }}>
      {/* Left slot */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        {isHome ? (
          <img src="/tlw_logo.jpg" alt="The Legends of TLW" style={{ height: 36, width: 'auto' }} />
        ) : (
          <button
            aria-label="Go back"
            onClick={() => typeof backOverride === 'function' ? backOverride() : backOverride ? navigate(backOverride) : navigate(-1)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <img src="/tlw_nav_back.png" alt="Back" style={{ height: 28, width: 'auto' }} />
          </button>
        )}
      </div>

      {/* Center slot */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {centerContent}
      </div>

      {/* Right slot — mute toggle */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button
          aria-label={muted ? 'Unmute music' : 'Mute music'}
          onClick={onToggleMute}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--gold)',
            fontSize: 22,
            cursor: 'pointer',
            padding: 4,
            lineHeight: 1,
            filter: 'drop-shadow(0 0 6px rgba(184,146,48,0.6))',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {muted ? (
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
