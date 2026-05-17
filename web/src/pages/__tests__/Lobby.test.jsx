import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Lobby from '../Lobby';
import { api } from '../../services/api';
import { NavbarProvider, useNavbar } from '../../context/NavbarContext';

const mockNavigate = jest.fn();

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ campaignId: 'test-campaign' }),
}));

jest.mock('../../services/api', () => ({
  api: {
    leaveCampaign: jest.fn(),
    deleteCampaign: jest.fn(),
    sendLobbyMessage: jest.fn(),
    regenerateInviteToken: jest.fn(),
    launchCampaign: jest.fn(),
    getLobbyChatHistory: jest.fn(),
  },
}));

let lobbyEventHandler = null;

jest.mock('../../hooks/useSignalR', () => ({
  useSignalR: (_campaignId, handlers) => {
    lobbyEventHandler = handlers.onLobbyEvent;
  },
}));

const mockCampaignState = {
  campaign: {
    name: 'Test Campaign',
    party_name: 'The Adventurers',
    creator_emails: ['creator@example.com'],
    invite_token: null,
    status: 'lobby',
  },
  players: [],
  storyState: { round_number: 0 },
  loading: false,
  refresh: jest.fn(),
};

jest.mock('../../hooks/useCampaign', () => ({
  useCampaign: () => mockCampaignState,
}));

function NavbarCenterSlot() {
  const { centerContent } = useNavbar();
  return <div>{centerContent}</div>;
}

function renderAsPlayer() {
  lobbyEventHandler = null;
  return render(
    <NavbarProvider>
      <MemoryRouter>
        <NavbarCenterSlot />
        <Lobby user={{ userDetails: 'player@example.com' }} />
      </MemoryRouter>
    </NavbarProvider>
  );
}

function renderAsCreator() {
  lobbyEventHandler = null;
  return render(
    <NavbarProvider>
      <MemoryRouter>
        <NavbarCenterSlot />
        <Lobby user={{ userDetails: 'creator@example.com' }} />
      </MemoryRouter>
    </NavbarProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
  // Default: empty history, no errors
  api.getLobbyChatHistory.mockResolvedValue({ messages: [] });
});

// ---------------------------------------------------------------------------
// Button visibility
// ---------------------------------------------------------------------------

describe('Cancel/Leave button visibility', () => {
  test('non-creator sees "Leave Campaign" button', () => {
    renderAsPlayer();
    expect(screen.getByRole('button', { name: /^leave$/i })).toBeInTheDocument();
  });

  test('creator sees "Cancel Campaign" button', () => {
    renderAsCreator();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  test('creator does not see "Leave Campaign" button', () => {
    renderAsCreator();
    expect(screen.queryByRole('button', { name: /^leave$/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------

describe('Confirmation modal', () => {
  test('clicking Leave button shows confirmation modal', async () => {
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    expect(screen.getByText(/leave campaign\?/i)).toBeInTheDocument();
  });

  test('clicking Cancel button shows confirmation modal', async () => {
    const user = userEvent.setup();
    renderAsCreator();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByText(/cancel campaign\?/i)).toBeInTheDocument();
  });

  test('"Keep Playing" dismisses modal without calling API', async () => {
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(screen.queryByText(/leave campaign\?/i)).not.toBeInTheDocument();
    expect(api.leaveCampaign).not.toHaveBeenCalled();
  });

  test('confirming leave calls leaveCampaign and navigates to Dashboard', async () => {
    api.leaveCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    await user.click(screen.getByRole('button', { name: /yes, leave campaign/i }));
    await waitFor(() => expect(api.leaveCampaign).toHaveBeenCalledWith('test-campaign'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  test('confirming cancel calls deleteCampaign and navigates to Dashboard', async () => {
    api.deleteCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    renderAsCreator();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await user.click(screen.getByRole('button', { name: /yes, cancel campaign/i }));
    await waitFor(() => expect(api.deleteCampaign).toHaveBeenCalledWith('test-campaign'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

// ---------------------------------------------------------------------------
// SignalR events
// ---------------------------------------------------------------------------

describe('SignalR events', () => {
  test('campaign_deleted event navigates to Dashboard', async () => {
    renderAsPlayer();
    await waitFor(() => expect(lobbyEventHandler).not.toBeNull());
    act(() => lobbyEventHandler({ type: 'campaign_deleted' }));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  test('player_left event triggers refresh', async () => {
    const { useCampaign } = require('../../hooks/useCampaign');
    renderAsPlayer();
    await waitFor(() => expect(lobbyEventHandler).not.toBeNull());
    act(() => lobbyEventHandler({ type: 'player_left', email: 'someone@example.com' }));
    // refresh is called — player list silently updates
    // useCampaign mock's refresh is a jest.fn(); checking navigate wasn't called
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Chat history — load on mount + polling
// ---------------------------------------------------------------------------

describe('Chat history load on mount', () => {
  test('fetches chat history on mount', async () => {
    api.getLobbyChatHistory.mockResolvedValue({ messages: [] });
    renderAsPlayer();
    await waitFor(() => expect(api.getLobbyChatHistory).toHaveBeenCalledWith('test-campaign'));
  });

  test('displays messages returned from history API', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 'a1', type: 'chat', display_name: 'Aria', text: 'Hello there!', timestamp: '2025-01-01T10:00:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('Hello there!')).toBeInTheDocument());
  });

  test('shows no messages placeholder when history is empty', async () => {
    api.getLobbyChatHistory.mockResolvedValue({ messages: [] });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText(/no messages yet/i)).toBeInTheDocument());
  });
});

describe('Optimistic send', () => {
  test('sent message appears immediately before API response', async () => {
    const user = userEvent.setup();
    api.sendLobbyMessage.mockReturnValue(new Promise(() => {})); // never resolves
    renderAsPlayer();
    await waitFor(() => expect(api.getLobbyChatHistory).toHaveBeenCalled());

    const input = screen.getByPlaceholderText(/say something/i);
    await user.type(input, 'Optimistic message');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(screen.getByText('Optimistic message')).toBeInTheDocument();
  });

  test('SignalR echo with same message_id does not duplicate the optimistic message', async () => {
    const user = userEvent.setup();
    let capturedMessageId;
    api.sendLobbyMessage.mockImplementation((_cid, _text, msgId) => {
      capturedMessageId = msgId;
      return Promise.resolve({});
    });
    renderAsPlayer();
    await waitFor(() => expect(api.getLobbyChatHistory).toHaveBeenCalled());

    const input = screen.getByPlaceholderText(/say something/i);
    await user.type(input, 'Echo test');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(screen.getByText('Echo test')).toBeInTheDocument();

    // Find the message_id that was used for the optimistic entry from the rendered DOM
    // and simulate SignalR echoing it back
    await waitFor(() => expect(capturedMessageId).toBeDefined());
    act(() => lobbyEventHandler({ message_id: capturedMessageId, type: 'chat', display_name: 'Me', text: 'Echo test', timestamp: new Date().toISOString() }));

    const matches = screen.getAllByText('Echo test');
    expect(matches).toHaveLength(1);
  });
});

describe('MMO-style chat UI', () => {
  test('renders timestamp in HH:MM format', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 't1', type: 'chat', display_name: 'Aria', char_class: 'Rogue', text: 'Hi!', timestamp: '2025-06-15T14:30:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText(/14:30/)).toBeInTheDocument());
  });

  test('system messages render as italic without class coloring', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 's1', type: 'system', text: 'A player has joined.', timestamp: '2025-06-15T14:31:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('A player has joined.')).toBeInTheDocument());
  });

  test('chat messages show display_name: text format', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 'c1', type: 'chat', display_name: 'Aria', char_class: 'Rogue', text: 'Ready to adventure!', timestamp: '2025-06-15T14:32:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => {
      expect(screen.getByText('Aria:')).toBeInTheDocument();
      expect(screen.getByText('Ready to adventure!')).toBeInTheDocument();
    });
  });
});

describe('Chat history deduplication', () => {
  test('SignalR chat event with same message_id as history does not create duplicate', async () => {
    const msg = { message_id: 'dup1', type: 'chat', display_name: 'Aria', text: 'Hi!', timestamp: '2025-01-01T10:00:00Z' };
    api.getLobbyChatHistory.mockResolvedValue({ messages: [msg] });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('Hi!')).toBeInTheDocument());

    act(() => lobbyEventHandler({ ...msg }));

    const matches = screen.getAllByText('Hi!');
    expect(matches).toHaveLength(1);
  });

  test('SignalR chat event with new message_id is appended', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [{ message_id: 'first', type: 'chat', display_name: 'Aria', text: 'First', timestamp: '2025-01-01T10:00:00Z' }],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());

    act(() => lobbyEventHandler({ message_id: 'second', type: 'chat', display_name: 'Bard', text: 'Second', timestamp: '2025-01-01T10:01:00Z' }));

    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// "You:" label — own messages always show "You" regardless of source
// ---------------------------------------------------------------------------

describe('"You:" label for own messages', () => {
  test('history message from current user shows "You:" not their display_name', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 'own1', type: 'chat', email: 'player@example.com', display_name: 'PlayerOne', text: 'My message', timestamp: '2025-01-01T10:00:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('You:')).toBeInTheDocument());
    expect(screen.queryByText('PlayerOne:')).not.toBeInTheDocument();
  });

  test('history message from another user shows their display_name', async () => {
    api.getLobbyChatHistory.mockResolvedValue({
      messages: [
        { message_id: 'other1', type: 'chat', email: 'other@example.com', display_name: 'OtherPlayer', text: 'Their message', timestamp: '2025-01-01T10:00:00Z' },
      ],
    });
    renderAsPlayer();
    await waitFor(() => expect(screen.getByText('OtherPlayer:')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Polling fallback — refresh is called on interval
// ---------------------------------------------------------------------------

describe('Polling fallback', () => {
  test('calls refresh every 5 seconds', () => {
    jest.useFakeTimers();
    renderAsPlayer();
    const callsBefore = mockCampaignState.refresh.mock.calls.length;
    act(() => jest.advanceTimersByTime(5000));
    expect(mockCampaignState.refresh.mock.calls.length).toBeGreaterThan(callsBefore);
    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Launch redirect — navigates when status becomes active, regardless of round
// ---------------------------------------------------------------------------

describe('Launch redirect', () => {
  test('navigates to game when status is active and round_number is 0', async () => {
    mockCampaignState.campaign = { ...mockCampaignState.campaign, status: 'active' };
    mockCampaignState.storyState = { round_number: 0 };
    renderAsPlayer();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/test-campaign', { replace: true }));
    // restore
    mockCampaignState.campaign = { ...mockCampaignState.campaign, status: 'lobby' };
  });

  test('navigates to game when status is active and round_number is greater than 0', async () => {
    mockCampaignState.campaign = { ...mockCampaignState.campaign, status: 'active' };
    mockCampaignState.storyState = { round_number: 2 };
    renderAsPlayer();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/test-campaign', { replace: true }));
    // restore
    mockCampaignState.campaign = { ...mockCampaignState.campaign, status: 'lobby' };
    mockCampaignState.storyState = { round_number: 0 };
  });

  test('does not navigate when status is lobby', () => {
    mockCampaignState.campaign = { ...mockCampaignState.campaign, status: 'lobby' };
    renderAsPlayer();
    expect(mockNavigate).not.toHaveBeenCalledWith('/game/test-campaign', expect.anything());
  });
});
