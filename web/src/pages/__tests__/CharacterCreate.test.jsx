import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterCreate from '../CharacterCreate';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getCampaign: jest.fn(),
    saveCharacter: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({ campaignId: 'test-campaign' }),
}));

jest.mock('../../components/character/ClassDiePicker', () =>
  function MockClassDiePicker({ onChange }) {
    return <button onClick={() => onChange('Fighter')}>Pick Class</button>;
  }
);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/campaigns/test-campaign/character/create']}>
      <Routes>
        <Route path="/campaigns/:campaignId/character/create" element={<CharacterCreate />} />
      </Routes>
    </MemoryRouter>
  );
}

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
