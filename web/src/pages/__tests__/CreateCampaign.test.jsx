import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateCampaign from '../CreateCampaign';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    createCampaign: jest.fn(),
    generateCampaignField: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateCampaign />
    </MemoryRouter>
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
