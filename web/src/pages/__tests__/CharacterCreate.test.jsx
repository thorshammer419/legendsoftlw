import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterCreate from '../CharacterCreate';
import { api } from '../../services/api';
import { NavbarProvider, useNavbar } from '../../context/NavbarContext';

const mockNavigate = jest.fn();

jest.mock('../../services/api', () => ({
  api: {
    getCampaign: jest.fn(),
    saveCharacter: jest.fn(),
    leaveCampaign: jest.fn(),
    deleteCampaign: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ campaignId: 'test-campaign' }),
}));

jest.mock('../../components/character/ClassDiePicker', () =>
  function MockClassDiePicker({ onChange }) {
    return <button onClick={() => onChange('Fighter')}>Pick Class</button>;
  }
);

let lobbyEventHandler = null;
jest.mock('../../hooks/useSignalR', () => ({
  useSignalR: (_campaignId, handlers) => {
    lobbyEventHandler = handlers.onLobbyEvent;
  },
}));

function NavbarCenterSlot() {
  const { centerContent } = useNavbar();
  return <div>{centerContent}</div>;
}

function renderPage() {
  lobbyEventHandler = null;
  return render(
    <NavbarProvider>
      <MemoryRouter initialEntries={['/campaigns/test-campaign/character/create']}>
        <NavbarCenterSlot />
        <Routes>
          <Route path="/campaigns/:campaignId/character/create" element={<CharacterCreate user={{ userDetails: 'player@example.com' }} />} />
        </Routes>
      </MemoryRouter>
    </NavbarProvider>
  );
}

function renderPageAsCreator() {
  lobbyEventHandler = null;
  return render(
    <NavbarProvider>
      <MemoryRouter initialEntries={['/campaigns/test-campaign/character/create']}>
        <NavbarCenterSlot />
        <Routes>
          <Route path="/campaigns/:campaignId/character/create" element={<CharacterCreate user={{ userDetails: 'creator@example.com' }} />} />
        </Routes>
      </MemoryRouter>
    </NavbarProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
  lobbyEventHandler = null;
})

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

describe('Loading state', () => {
  test('shows spinner before campaign data loads', () => {
    api.getCampaign.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  test('hides spinner after campaign data loads', async () => {
    api.getCampaign.mockResolvedValue({ max_starting_level: 5 });
    renderPage();
    await waitFor(() => expect(document.querySelector('.spinner')).not.toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Starting Level dropdown
// ---------------------------------------------------------------------------

describe('Starting Level dropdown', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows a select when loaded', async () => {
    api.getCampaign.mockResolvedValue({ max_starting_level: 3 });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
  });

  test('offers exactly the allowed levels (1 to max_starting_level)', async () => {
    api.getCampaign.mockResolvedValue({ max_starting_level: 5 });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    const select = screen.getByLabelText(/starting level/i);
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });

  test('defaults to the max_starting_level', async () => {
    api.getCampaign.mockResolvedValue({ max_starting_level: 7 });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/starting level/i).value).toBe('7');
  });

  test('player can select any level in range', async () => {
    const user = userEvent.setup();
    api.getCampaign.mockResolvedValue({ max_starting_level: 5 });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/starting level/i), '3');
    expect(screen.getByLabelText(/starting level/i).value).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// Backwards compatibility — missing max_starting_level
// ---------------------------------------------------------------------------

describe('Backwards compatibility', () => {
  afterEach(() => jest.clearAllMocks());

  test('defaults to 20 levels when campaign has no max_starting_level', async () => {
    api.getCampaign.mockResolvedValue({}); // old campaign, no field
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    const select = screen.getByLabelText(/starting level/i);
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test('defaults to level 20 when campaign has no max_starting_level', async () => {
    api.getCampaign.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/starting level/i).value).toBe('20');
  });

  test('defaults to 20 levels when getCampaign fails', async () => {
    api.getCampaign.mockRejectedValue(new Error('network error'));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/starting level/i)).toBeInTheDocument());
    const select = screen.getByLabelText(/starting level/i);
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

// ---------------------------------------------------------------------------
// Cancel / Leave Campaign
// ---------------------------------------------------------------------------

describe('Cancel/Leave Campaign button', () => {
  beforeEach(() => {
    api.getCampaign.mockResolvedValue({
      max_starting_level: 5,
      creator_emails: ['creator@example.com'],
    });
  });

  test('non-creator sees "Leave Campaign" button after load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^leave$/i })).toBeInTheDocument());
  });

  test('creator sees "Cancel Campaign" button after load', async () => {
    renderPageAsCreator();
    await waitFor(() => expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument());
  });

  test('clicking Leave button shows confirmation modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^leave$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    expect(screen.getByText(/leave campaign\?/i)).toBeInTheDocument();
  });

  test('"Keep Playing" dismisses the modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^leave$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(screen.queryByText(/leave campaign\?/i)).not.toBeInTheDocument();
  });

  test('confirming leave calls leaveCampaign and navigates to Dashboard', async () => {
    api.leaveCampaign.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^leave$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^leave$/i }));
    await user.click(screen.getByRole('button', { name: /yes, leave campaign/i }));
    await waitFor(() => expect(api.leaveCampaign).toHaveBeenCalledWith('test-campaign'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

describe('SignalR campaign_deleted in CharacterCreate', () => {
  beforeEach(() => {
    api.getCampaign.mockResolvedValue({
      max_starting_level: 5,
      creator_emails: ['creator@example.com'],
    });
  });

  test('campaign_deleted event navigates to Dashboard', async () => {
    renderPage();
    await waitFor(() => expect(lobbyEventHandler).not.toBeNull());
    act(() => lobbyEventHandler({ type: 'campaign_deleted' }));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
