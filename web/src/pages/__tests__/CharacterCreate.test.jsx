import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterCreate from '../CharacterCreate';
import { api } from '../../services/api';
import { NavbarProvider, useNavbar } from '../../context/NavbarContext';
import { rollDice } from '../../utils/diceRoller';

jest.mock('../../utils/diceRoller', () => ({
  rollDice: jest.fn(),
}));

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

// ---------------------------------------------------------------------------
// Standard Array picker — step 2
// ---------------------------------------------------------------------------

const SA_CAMPAIGN = {
  max_starting_level: 1,
  creator_emails: [],
  ability_score_method: 'standard_array',
  ability_score_rules: { standard_array: [15, 14, 13, 12, 10, 8] },
};

async function goToStep2(user) {
  await waitFor(() => expect(screen.getByLabelText(/character name/i)).toBeInTheDocument());
  await user.type(screen.getByLabelText(/character name/i), 'Aldric');
  await user.click(screen.getByRole('button', { name: /ability scores/i }));
}

describe('Standard Array picker', () => {
  beforeEach(() => {
    api.getCampaign.mockResolvedValue(SA_CAMPAIGN);
  });

  test('step 2 shows chip values when method is standard_array', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: '15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8' })).toBeInTheDocument();
  });

  test('old campaign (no method) shows default chips [15,14,13,12,10,8]', async () => {
    api.getCampaign.mockResolvedValue({ max_starting_level: 1, creator_emails: [] });
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    [15, 14, 13, 12, 10, 8].forEach((v) =>
      expect(screen.getByRole('button', { name: String(v) })).toBeInTheDocument()
    );
  });

  test('clicking an ability slot marks it as selected (aria-pressed)', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getByRole('button', { name: /^STR/i }));
    expect(screen.getByRole('button', { name: /^STR/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking a chip when a slot is focused assigns it', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getByRole('button', { name: /^STR/i }));
    await user.click(screen.getByRole('button', { name: '15' }));
    expect(screen.queryByRole('button', { name: '15' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^STR/i })).toHaveTextContent('15');
  });

  test('clicking an assigned slot returns chip to pool', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getByRole('button', { name: /^STR/i }));
    await user.click(screen.getByRole('button', { name: '15' }));
    await user.click(screen.getByRole('button', { name: /^STR/i }));
    expect(screen.getByRole('button', { name: '15' })).toBeInTheDocument();
  });

  test('save button disabled until all 6 slots filled', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /enter the adventure/i })).toBeDisabled();
  });

  test('save button enabled when all 6 assigned', async () => {
    api.getCampaign.mockResolvedValue(SA_CAMPAIGN);
    api.saveCharacter.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    const abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const chips = [15, 14, 13, 12, 10, 8];
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${abilities[i]}`) }));
      await user.click(screen.getByRole('button', { name: String(chips[i]) }));
    }
    expect(screen.getByRole('button', { name: /enter the adventure/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Point Buy picker — step 2
// ---------------------------------------------------------------------------

const PB_CAMPAIGN = {
  max_starting_level: 1,
  creator_emails: [],
  ability_score_method: 'point_buy',
  ability_score_rules: { point_buy_points: 27 },
};

describe('Point Buy picker', () => {
  beforeEach(() => {
    api.getCampaign.mockResolvedValue(PB_CAMPAIGN);
  });

  test('step 2 shows +/− controls when method is point_buy', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /increase strength/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease strength/i })).toBeInTheDocument();
  });

  test('all scores start at 8', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getAllByText('8')).toHaveLength(6);
  });

  test('remaining budget is displayed', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByText('27')).toBeInTheDocument();
  });

  test('clicking + increases score and reduces budget', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getByRole('button', { name: /increase strength/i }));
    expect(screen.getByText('26')).toBeInTheDocument(); // budget reduced by 1
    expect(screen.getAllByText('8')).toHaveLength(5);   // 5 scores still at 8
  });

  test('clicking − decreases score and restores budget', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getByRole('button', { name: /increase strength/i }));
    await user.click(screen.getByRole('button', { name: /decrease strength/i }));
    expect(screen.getByText('27')).toBeInTheDocument(); // budget restored
  });

  test('− button disabled when score is 8', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /decrease strength/i })).toBeDisabled();
  });

  test('+ button disabled when score is 15', async () => {
    const user = userEvent.setup();
    api.getCampaign.mockResolvedValue({
      ...PB_CAMPAIGN,
      ability_score_rules: { point_buy_points: 99 }, // plenty of points
    });
    renderPage();
    await goToStep2(user);
    // Raise STR from 8 to 15 (costs 9 points)
    for (let i = 0; i < 7; i++) {
      await user.click(screen.getByRole('button', { name: /increase strength/i }));
    }
    expect(screen.getByRole('button', { name: /increase strength/i })).toBeDisabled();
  });

  test('+ button disabled when increase would exceed budget', async () => {
    const user = userEvent.setup();
    api.getCampaign.mockResolvedValue({
      ...PB_CAMPAIGN,
      ability_score_rules: { point_buy_points: 0 }, // no budget
    });
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /increase strength/i })).toBeDisabled();
  });

  test('save button enabled when within budget', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /enter the adventure/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Roll for Stats picker — step 2
// ---------------------------------------------------------------------------

const ROLL_CAMPAIGN = {
  max_starting_level: 1,
  creator_emails: [],
  ability_score_method: 'roll_for_stats',
  ability_score_rules: { roll_dice: 4, roll_keep: 3 },
};

const FIXED_ROLL = { rolls: [6, 5, 4, 1], kept: [6, 5, 4], dropped: [1], sum: 15 };

describe('Roll for Stats picker', () => {
  beforeEach(() => {
    api.getCampaign.mockResolvedValue(ROLL_CAMPAIGN);
    rollDice.mockReturnValue(FIXED_ROLL);
  });

  test('step 2 shows Roll All and individual Roll buttons', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /roll all/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^roll$/i })).toHaveLength(6);
  });

  test('Roll All is disabled once any score has been rolled', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getAllByRole('button', { name: /^roll$/i })[0]);
    expect(screen.getByRole('button', { name: /roll all/i })).toBeDisabled();
  });

  test('rolling a slot shows the dice result and removes its Roll button', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getAllByRole('button', { name: /^roll$/i })[0]);
    expect(screen.getAllByRole('button', { name: /^roll$/i })).toHaveLength(5);
    expect(screen.getByText('= 15')).toBeInTheDocument();
  });

  test('kept dice are shown with gold styling, dropped dice are crossed out', async () => {
    rollDice.mockReturnValue({ rolls: [6, 5, 4, 1], kept: [6, 5, 4], dropped: [1], sum: 15 });
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    await user.click(screen.getAllByRole('button', { name: /^roll$/i })[0]);
    // dice sorted descending: 6,5,4 kept (gold), 1 dropped (line-through)
    const dice = document.querySelectorAll('[style*="line-through"]');
    expect(dice.length).toBeGreaterThan(0);
  });

  test('after all 6 rolled, transitions to chip assign phase', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    const rollBtns = screen.getAllByRole('button', { name: /^roll$/i });
    for (const btn of rollBtns) await user.click(btn);
    expect(screen.queryByRole('button', { name: /^roll$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /roll all/i })).not.toBeInTheDocument();
  });

  test('assign phase: clicking a slot then a chip assigns it', async () => {
    rollDice.mockReturnValue({ rolls: [5, 4, 3, 1], kept: [5, 4, 3], dropped: [1], sum: 12 });
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    const rollBtns = screen.getAllByRole('button', { name: /^roll$/i });
    for (const btn of rollBtns) await user.click(btn);
    await user.click(screen.getByRole('button', { name: /^STR/i }));
    await user.click(screen.getAllByRole('button', { name: '12' })[0]);
    expect(screen.getByRole('button', { name: /^STR/i })).toHaveTextContent('12');
  });

  test('save button disabled during roll phase', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    expect(screen.getByRole('button', { name: /enter the adventure/i })).toBeDisabled();
  });

  test('save button disabled in assign phase until all placed', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToStep2(user);
    const rollBtns = screen.getAllByRole('button', { name: /^roll$/i });
    for (const btn of rollBtns) await user.click(btn);
    expect(screen.getByRole('button', { name: /enter the adventure/i })).toBeDisabled();
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
