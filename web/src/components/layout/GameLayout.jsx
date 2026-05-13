import { useState } from 'react';
import CharacterPanel from '../character/CharacterPanel';
import NarrativeFeed from '../narrative/NarrativeFeed';
import ActionPanel from '../action/ActionPanel';
import QuestLog from '../quest/QuestLog';
import PartyStatus from '../quest/PartyStatus';
import AdminDrawer from '../admin/AdminDrawer';

export default function GameLayout({
  campaign, character, storyState, actionList, partyStatus, narrativeFeed,
  submitted, onSubmit, actionEconomy, campaignPlayers, isAdmin, onRefresh,
}) {
  const [adminOpen, setAdminOpen] = useState(false);
  const campaignId = campaign?.campaign_id || campaign?.id?.replace('campaign_', '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* App bar */}
      <div className="app-bar">
        <div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🐉 </span>
          <span className="app-bar-title">The Legends of TLW</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{campaign?.name}</span>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAdminOpen(true)}>⚙ Admin</button>
          )}
        </div>
      </div>

      {/* Three-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Character Sheet */}
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
          <CharacterPanel
            character={character}
            actionEconomy={actionEconomy}
            onSelectAction={(action) => {/* handled via ActionPanel */}}
          />
        </div>

        {/* Center: Narrative + Action Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <NarrativeFeed feed={narrativeFeed} submitted={submitted} partyStatus={partyStatus} />
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
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
        </div>

        {/* Right: Quest + Party */}
        <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div className="scroll" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PartyStatus partyStatus={partyStatus} submitted={submitted} />
            <hr className="divider" />
            <QuestLog storyState={storyState} />
          </div>
        </div>
      </div>

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
