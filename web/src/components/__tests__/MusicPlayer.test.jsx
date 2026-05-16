import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MusicPlayer from '../MusicPlayer';

beforeEach(() => {
  jest.useFakeTimers();
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = jest.fn();
});

afterEach(() => {
  act(() => jest.runAllTimers());
  jest.useRealTimers();
});

function renderPlayer(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MusicPlayer />
    </MemoryRouter>
  );
}

test('mute toggle button is present with an accessible label on mount', () => {
  renderPlayer();
  expect(screen.getByRole('button', { name: /mute music/i })).toBeInTheDocument();
});

test('clicking mute changes button label to unmute', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  renderPlayer();
  await user.click(screen.getByRole('button', { name: /mute music/i }));
  expect(screen.getByRole('button', { name: /unmute music/i })).toBeInTheDocument();
});

test('clicking mute again restores mute label', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  renderPlayer();
  await user.click(screen.getByRole('button', { name: /mute music/i }));
  await user.click(screen.getByRole('button', { name: /unmute music/i }));
  expect(screen.getByRole('button', { name: /mute music/i })).toBeInTheDocument();
});

test('audio does not replay before 60 seconds after song ends', () => {
  renderPlayer();
  const audio = document.querySelector('audio');
  const playCount = window.HTMLMediaElement.prototype.play.mock.calls.length;
  act(() => audio.dispatchEvent(new Event('ended')));
  act(() => jest.advanceTimersByTime(59_999));
  expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playCount);
});

test('audio replays after 60 seconds when song ends', () => {
  renderPlayer();
  const audio = document.querySelector('audio');
  const playCount = window.HTMLMediaElement.prototype.play.mock.calls.length;
  act(() => audio.dispatchEvent(new Event('ended')));
  act(() => jest.advanceTimersByTime(60_000));
  expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playCount + 1);
});
