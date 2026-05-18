import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useMusicPlayer } from './hooks/useMusicPlayer';
import { NavbarProvider, useNavbar } from './context/NavbarContext';
import Navbar from './components/Navbar';
import { api } from './services/api';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import Dashboard from './pages/Dashboard';
import CreateCampaign from './pages/CreateCampaign';
import CharacterCreate from './pages/CharacterCreate';
import CampaignArchive from './pages/CampaignArchive';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Admin from './pages/Admin';
import JoinCampaign from './pages/JoinCampaign';

const NAVBAR_HEIGHT = 52;

function AppShell({ user, isAdmin }) {
  const { pathname } = useLocation();
  const { muted, toggleMute } = useMusicPlayer();
  const { pendingRerollRequest, setPendingRerollRequest } = useNavbar();
  const isGame = pathname.startsWith('/game/');

  const handleRerollResponse = async (approved) => {
    if (!pendingRerollRequest) return;
    try {
      await api.rerollResponse(pendingRerollRequest.campaignId, {
        player_email: pendingRerollRequest.player_email,
        approved,
      });
    } catch {
      // fail silently — player will see timeout
    }
    setPendingRerollRequest(null);
  };

  return (
    <>
      {!isGame && <Navbar muted={muted} onToggleMute={toggleMute} />}
      <div style={isGame ? {} : { paddingTop: NAVBAR_HEIGHT }}>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/campaigns/new" element={<CreateCampaign />} />
          <Route path="/campaigns/:campaignId/character" element={<CharacterCreate user={user} />} />
          <Route path="/campaigns/:campaignId/lobby" element={<Lobby user={user} isAdmin={isAdmin} />} />
          <Route path="/campaigns/:campaignId/archive" element={<CampaignArchive user={user} />} />
          <Route path="/campaigns/:campaignId/admin" element={<Admin user={user} isAdmin={isAdmin} />} />
          <Route path="/game/:campaignId" element={<Game user={user} isAdmin={isAdmin} />} />
          <Route path="/campaigns/invite/:token" element={<JoinCampaign />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Global reroll approval card — shown to campaign creator */}
      {pendingRerollRequest && (
        <div style={{
          position: 'fixed', top: 72, right: 16, zIndex: 200,
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)', minWidth: 260,
        }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--gold)', fontSize: 14 }}>Reroll Request</h4>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong>{pendingRerollRequest.player_display_name}</strong> wants to reroll their <strong>{pendingRerollRequest.old_value}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleRerollResponse(true)}
            >
              Approve
            </button>
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent' }}
              onClick={() => handleRerollResponse(false)}
            >
              Deny
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const { user, loading, isAdmin, unauthorized } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (unauthorized) return <Unauthorized />;
  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <NavbarProvider>
        <AppShell user={user} isAdmin={isAdmin} />
      </NavbarProvider>
    </BrowserRouter>
  );
}
