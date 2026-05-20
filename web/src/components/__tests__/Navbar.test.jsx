import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';
import { NavbarContext } from '../../context/NavbarContext';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function renderNavbar(backOverrideValue = null) {
  return render(
    <NavbarContext.Provider value={{
      centerContent: null,
      setCenterContent: () => {},
      pendingRerollRequest: null,
      setPendingRerollRequest: () => {},
      backOverride: backOverrideValue,
      setBackOverride: () => {},
    }}>
      <MemoryRouter initialEntries={['/campaigns/test/lobby']}>
        <Navbar muted={false} onToggleMute={() => {}} />
      </MemoryRouter>
    </NavbarContext.Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
});

// ---------------------------------------------------------------------------
// Navbar back arrow — backOverride variants
// ---------------------------------------------------------------------------

describe('Navbar back arrow', () => {
  test('calls the function when backOverride is a function', async () => {
    const fn = jest.fn();
    const user = userEvent.setup();
    renderNavbar(fn);
    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('navigates to the URL string when backOverride is a string', async () => {
    const user = userEvent.setup();
    renderNavbar('/campaigns/test/character');
    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/campaigns/test/character');
  });

  test('navigates -1 when backOverride is null', async () => {
    const user = userEvent.setup();
    renderNavbar(null);
    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
