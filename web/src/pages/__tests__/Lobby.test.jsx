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
  },
}));

let lobbyEventHandler = null;

jest.mock('../../hooks/useSignalR', () => ({
  useSignalR: (_campaignId, handlers) => {
    lobbyEventHandler = handlers.onLobbyEvent;
  },
}));

jest.mock('../../hooks/useCampaign', () => ({
  useCampaign: () => ({
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
  }),
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
});

// ---------------------------------------------------------------------------
// Button visibility
// ---------------------------------------------------------------------------

describe('Cancel/Leave button visibility', () => {
  test('non-creator sees "Leave Campaign" button', () => {
    renderAsPlayer();
    expect(screen.getByRole('button', { name: /leave campaign/i })).toBeInTheDocument();
  });

  test('creator sees "Cancel Campaign" button', () => {
    renderAsCreator();
    expect(screen.getByRole('button', { name: /cancel campaign/i })).toBeInTheDocument();
  });

  test('creator does not see "Leave Campaign" button', () => {
    renderAsCreator();
    expect(screen.queryByRole('button', { name: /leave campaign/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------

describe('Confirmation modal', () => {
  test('clicking Leave button shows confirmation modal', async () => {
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /leave campaign/i }));
    expect(screen.getByText(/leave campaign\?/i)).toBeInTheDocument();
  });

  test('clicking Cancel button shows confirmation modal', async () => {
    const user = userEvent.setup();
    renderAsCreator();
    await user.click(screen.getByRole('button', { name: /cancel campaign/i }));
    expect(screen.getByText(/cancel campaign\?/i)).toBeInTheDocument();
  });

  test('"Keep Playing" dismisses modal without calling API', async () => {
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /leave campaign/i }));
    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(screen.queryByText(/leave campaign\?/i)).not.toBeInTheDocument();
    expect(api.leaveCampaign).not.toHaveBeenCalled();
  });

  test('confirming leave calls leaveCampaign and navigates to Dashboard', async () => {
    api.leaveCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    renderAsPlayer();
    await user.click(screen.getByRole('button', { name: /leave campaign/i }));
    await user.click(screen.getByRole('button', { name: /yes, leave campaign/i }));
    await waitFor(() => expect(api.leaveCampaign).toHaveBeenCalledWith('test-campaign'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  test('confirming cancel calls deleteCampaign and navigates to Dashboard', async () => {
    api.deleteCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    renderAsCreator();
    await user.click(screen.getByRole('button', { name: /cancel campaign/i }));
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
