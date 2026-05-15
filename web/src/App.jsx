import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
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
    </BrowserRouter>
  );
}
