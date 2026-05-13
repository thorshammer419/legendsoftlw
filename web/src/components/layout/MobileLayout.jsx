import { useState } from 'react';
import CharacterPanel from '../character/CharacterPanel';
import NarrativeFeed from '../narrative/NarrativeFeed';
import ActionPanel from '../action/ActionPanel';
import QuestLog from '../quest/QuestLog';
import PartyStatus from '../quest/PartyStatus';
import AdminDrawer from '../admin/AdminDrawer';

export default function MobileLayout({
  campaign, character, storyState, actionList, partyStatus, narrativeFeed,
  submitted, onSubmit, actionEconomy, campaignPlayers, isAdmin, onRefresh,
}) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const campaignId = campaign?.campaign_id || campaign?.id?.replace('campaign_', '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* App bar */}
      <div className="app-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => setLeftOpen(true)}>☰ Sheet</button>
        <span className="app-bar-title">Legends</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setAdminOpen(true)}>⚙</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setRightOpen(true)}>Quest ☰</button>
        </div>
      </div>

      {/* Narrative feed — main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <NarrativeFeed feed={narrativeFeed} submitted={submitted} partyStatus={partyStatus} />
      </div>

      {/* Action panel — pinned to bottom */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, maxHeight: '45vh', overflow: 'hidden' }}>
        <ActionPanel
          character={character}
          storyState={storyState}
          actionList={actionList}
          campaignId={campaignId}
          submitted={submitted}
          onSubmit={onSubmit}
          actionEconomy={actionEconomy}
        />
      </div>

      {/* Left drawer: Character Sheet */}
      {leftOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setLeftOpen(false)} />
          <div className="drawer drawer-left" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-header">
              <h3>{character?.name || 'Character Sheet'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setLeftOpen(false)}>✕</button>
            </div>
            <CharacterPanel character={character} actionEconomy={actionEconomy} />
          </div>
        </>
      )}

      {/* Right drawer: Quest + Party */}
      {rightOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setRightOpen(false)} />
          <div className="drawer drawer-right">
            <div className="drawer-header">
              <h3>Quest & Party</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setRightOpen(false)}>✕</button>
            </div>
            <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <PartyStatus partyStatus={partyStatus} submitted={submitted} />
              <hr className="divider" />
              <QuestLog storyState={storyState} />
            </div>
          </div>
        </>
      )}

      {isAdmin && (
        <AdminDrawer
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          campaignId={campaignId}
          campaignPlayers={campaignPlayers}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
