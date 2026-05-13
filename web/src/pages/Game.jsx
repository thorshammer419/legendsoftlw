import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../hooks/useGame';
import { useSignalR } from '../hooks/useSignalR';
import GameLayout from '../components/layout/GameLayout';
import MobileLayout from '../components/layout/MobileLayout';

export default function Game({ user, isAdmin }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const {
    gameState, campaign, narrativeFeed, loading, submitted, error,
    submitAction, onNarrativeUpdate, refresh,
    character, storyState, actionList, partyStatus,
  } = useGame(campaignId);

  useSignalR(campaignId, { onNarrativeUpdate });

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Redirect to character creation if player has no character yet
  useEffect(() => {
    if (!loading && gameState && !character) {
      navigate(`/campaigns/${campaignId}/character`);
    }
  }, [loading, gameState, character, campaignId, navigate]);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ marginBottom: 8 }}>Could not load game</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  const Layout = isMobile ? MobileLayout : GameLayout;

  return (
    <Layout
      campaign={campaign}
      character={character}
      storyState={storyState}
      actionList={actionList}
      partyStatus={partyStatus}
      narrativeFeed={narrativeFeed}
      submitted={submitted}
      onSubmit={submitAction}
      actionEconomy={gameState?.action_economy}
      campaignPlayers={partyStatus}
      isAdmin={isAdmin(campaign)}
      onRefresh={refresh}
    />
  );
}
