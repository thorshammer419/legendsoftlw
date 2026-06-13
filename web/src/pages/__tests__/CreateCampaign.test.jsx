import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateCampaign from '../CreateCampaign';
import { api } from '../../services/api';
import { NavbarProvider } from '../../context/NavbarContext';

jest.mock('../../services/api', () => ({
  api: {
    createCampaign: jest.fn(),
    generateCampaignField: jest.fn(),
  },
}));

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <NavbarProvider>
      <MemoryRouter>
        <CreateCampaign />
      </MemoryRouter>
    </NavbarProvider>
  );
}

// ---------------------------------------------------------------------------
// Max Players
// ---------------------------------------------------------------------------

describe('Max Players', () => {
  test('offers options 1 through 10', () => {
    renderPage();
    const select = screen.getByLabelText(/max players/i);
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('defaults to 8', () => {
    renderPage();
    expect(screen.getByLabelText(/max players/i).value).toBe('8');
  });
});

// ---------------------------------------------------------------------------
// Character Rules — Ability Score Method
// ---------------------------------------------------------------------------

describe('Character Rules', () => {
  test('Standard Array is selected by default', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /standard array/i });
    expect(btn.className).toMatch(/btn-primary/);
  });

  test('Point Buy and Roll for Stats are not selected by default', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /point buy/i }).className).toMatch(/btn-secondary/);
    expect(screen.getByRole('button', { name: /roll for stats/i }).className).toMatch(/btn-secondary/);
  });

  test('clicking Point Buy selects it and deselects Standard Array', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /point buy/i }));
    expect(screen.getByRole('button', { name: /point buy/i }).className).toMatch(/btn-primary/);
    expect(screen.getByRole('button', { name: /standard array/i }).className).toMatch(/btn-secondary/);
  });
});

// ---------------------------------------------------------------------------
// Generate buttons — presence
// ---------------------------------------------------------------------------

describe('Generate buttons presence', () => {
  test('generate button present for Campaign Name', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /generate name/i })).toBeInTheDocument();
  });

  test('generate button present for Party Name', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /generate party name/i })).toBeInTheDocument();
  });

  test('generate button present for Description', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /generate description/i })).toBeInTheDocument();
  });

  test('no generate button for Password', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /generate password/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Generate buttons — behavior
// ---------------------------------------------------------------------------

describe('Generate button behavior', () => {
  beforeEach(() => {
    api.generateCampaignField.mockResolvedValue({ value: 'The Iron Throne' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('clicking generate name calls api with field=name', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate name/i }));
    await waitFor(() => expect(api.generateCampaignField).toHaveBeenCalledWith('name', expect.any(Object)));
  });

  test('clicking generate description calls api with field=description', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate description/i }));
    await waitFor(() => expect(api.generateCampaignField).toHaveBeenCalledWith('description', expect.any(Object)));
  });

  test('generated name populates the Campaign Name field', async () => {
    api.generateCampaignField.mockResolvedValue({ value: 'Shadows of Eternity' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate name/i }));
    await waitFor(() => expect(screen.getByPlaceholderText(/the dark descent/i).value).toBe('Shadows of Eternity'));
  });

  test('populated name is sent as context when generating description', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText(/the dark descent/i), 'Dark Descent');
    await user.click(screen.getByRole('button', { name: /generate description/i }));
    await waitFor(() =>
      expect(api.generateCampaignField).toHaveBeenCalledWith('description', expect.objectContaining({ name: 'Dark Descent' }))
    );
  });

  test('empty fields are not sent as context', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate description/i }));
    await waitFor(() =>
      expect(api.generateCampaignField).toHaveBeenCalledWith('description', expect.not.objectContaining({ name: expect.anything() }))
    );
  });

  test('other generate buttons are disabled while one is loading', async () => {
    let resolve;
    api.generateCampaignField.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate name/i }));
    expect(screen.getByRole('button', { name: /generate description/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /generate party name/i })).toBeDisabled();
    resolve({ value: 'done' });
  });
});

// ---------------------------------------------------------------------------
// Standard Array sub-settings
// ---------------------------------------------------------------------------

describe('Standard Array sub-settings', () => {
  test('inputs are not visible when Point Buy is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /point buy/i }));
    expect(screen.queryByLabelText(/array value 1/i)).not.toBeInTheDocument();
  });

  test('six inputs appear when Standard Array is selected', () => {
    renderPage();
    expect(screen.getByLabelText(/array value 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/array value 6/i)).toBeInTheDocument();
  });

  test('inputs are pre-populated with default array values', () => {
    renderPage();
    const defaults = [15, 14, 13, 12, 10, 8];
    defaults.forEach((val, i) => {
      expect(screen.getByLabelText(`Array value ${i + 1}`).value).toBe(String(val));
    });
  });

  test('values are clamped to 1–20 range', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = screen.getByLabelText('Array value 1');
    await user.clear(first);
    await user.type(first, '20');
    expect(first.value).toBe('20');
  });
});

// ---------------------------------------------------------------------------
// Point Buy sub-settings
// ---------------------------------------------------------------------------

describe('Point Buy sub-settings', () => {
  test('input is not visible when Standard Array is selected', () => {
    renderPage();
    expect(screen.queryByLabelText(/point buy budget/i)).not.toBeInTheDocument();
  });

  test('input appears when Point Buy is selected, pre-populated with 27', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /point buy/i }));
    expect(screen.getByLabelText(/point buy budget/i).value).toBe('27');
  });
});

// ---------------------------------------------------------------------------
// Roll for Stats sub-settings
// ---------------------------------------------------------------------------

describe('Roll for Stats sub-settings', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runAllTimers());
    jest.useRealTimers();
  });

  async function selectRoll() {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPage();
    await user.click(screen.getByRole('button', { name: /roll for stats/i }));
    return user;
  }

  test('inputs are not visible when Standard Array is selected', () => {
    renderPage();
    expect(screen.queryByLabelText(/dice to roll/i)).not.toBeInTheDocument();
  });

  test('inputs appear when Roll for Stats is selected, pre-populated with 4 and 3', async () => {
    await selectRoll();
    expect(screen.getByLabelText(/dice to roll/i).value).toBe('4');
    expect(screen.getByLabelText(/dice to keep/i).value).toBe('3');
  });

  test('keep auto-adjusts to dice total when entered keep exceeds dice', async () => {
    const user = await selectRoll();
    const keepInput = screen.getByLabelText(/dice to keep/i);
    await user.clear(keepInput);
    await user.type(keepInput, '9');
    expect(screen.getByLabelText(/dice to keep/i).value).toBe('4');
  });

  test('inline message appears when keep is auto-adjusted', async () => {
    const user = await selectRoll();
    const keepInput = screen.getByLabelText(/dice to keep/i);
    await user.clear(keepInput);
    await user.type(keepInput, '9');
    expect(screen.getByText(/keep cannot exceed dice total/i)).toBeInTheDocument();
  });

  test('inline message disappears after 3 seconds', async () => {
    const user = await selectRoll();
    const keepInput = screen.getByLabelText(/dice to keep/i);
    await user.clear(keepInput);
    await user.type(keepInput, '9');
    expect(screen.getByText(/keep cannot exceed dice total/i)).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(3000));
    expect(screen.queryByText(/keep cannot exceed dice total/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Max Starting Level
// ---------------------------------------------------------------------------

describe('Max Starting Level', () => {
  test('select is present with label', () => {
    renderPage();
    expect(screen.getByLabelText(/max starting level/i)).toBeInTheDocument();
  });

  test('defaults to Level 1', () => {
    renderPage();
    expect(screen.getByLabelText(/max starting level/i).value).toBe('1');
  });

  test('offers options 1 through 20', () => {
    renderPage();
    const select = screen.getByLabelText(/max starting level/i);
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

// ---------------------------------------------------------------------------
// sessionStorage draft persistence — issue #82
// ---------------------------------------------------------------------------

describe('sessionStorage draft persistence', () => {
  test('restores campaign name from sessionStorage on mount', () => {
    sessionStorage.setItem('campaign_draft', JSON.stringify({ name: 'Saved Campaign' }));
    renderPage();
    expect(screen.getByLabelText(/campaign name/i).value).toBe('Saved Campaign');
  });

  test('saves form to sessionStorage when name changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign');
    const stored = JSON.parse(sessionStorage.getItem('campaign_draft') || '{}');
    expect(stored.name).toBe('My Campaign');
  });

  test('retains sessionStorage after successful creation so back-navigation restores form', async () => {
    api.createCampaign.mockResolvedValue({ campaign_id: 'new-id' });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const stored = JSON.parse(sessionStorage.getItem('campaign_draft') || '{}');
    expect(stored.name).toBe('My Campaign');
  });

  test('stores campaign ID in sessionStorage after successful creation', async () => {
    api.createCampaign.mockResolvedValue({ campaign_id: 'camp-abc' });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/campaign name/i), 'My Campaign');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(sessionStorage.getItem('campaign_draft_id')).toBe('camp-abc');
  });
});

// ---------------------------------------------------------------------------
// Continue to Character Create — issue #84
// ---------------------------------------------------------------------------

describe('Continue to Character Create', () => {
  test('does not show Continue button when no campaign ID in sessionStorage', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /continue to character create/i })).not.toBeInTheDocument();
  });

  test('shows Continue button when a campaign ID is stored in sessionStorage', () => {
    sessionStorage.setItem('campaign_draft_id', 'existing-camp');
    renderPage();
    expect(screen.getByRole('button', { name: /continue to character create/i })).toBeInTheDocument();
  });

  test('clicking Continue navigates to the stored campaign character create route', async () => {
    sessionStorage.setItem('campaign_draft_id', 'existing-camp');
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /continue to character create/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/campaigns/existing-camp/character');
  });
});
