import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassDiePicker from '../ClassDiePicker';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => jest.runAllTimers());
  jest.useRealTimers();
});

test('renders Barbarian class name on mount', () => {
  render(<ClassDiePicker />);
  expect(screen.getByText('Barbarian')).toBeInTheDocument();
});

test('right arrow advances to Bard', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<ClassDiePicker />);
  await user.click(screen.getByRole('button', { name: /next class/i }));
  act(() => jest.runAllTimers());
  expect(screen.getByText('Bard')).toBeInTheDocument();
});

test('onChange fires with the correct class name on advance', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onChange = jest.fn();
  render(<ClassDiePicker onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /next class/i }));
  act(() => jest.runAllTimers());
  expect(onChange).toHaveBeenCalledWith('Bard');
});

test('left arrow from first class wraps to Wizard', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<ClassDiePicker />);
  await user.click(screen.getByRole('button', { name: /previous class/i }));
  act(() => jest.runAllTimers());
  expect(screen.getByText('Wizard')).toBeInTheDocument();
});

test('arrow buttons have accessible labels', () => {
  render(<ClassDiePicker />);
  expect(screen.getByRole('button', { name: /previous class/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next class/i })).toBeInTheDocument();
});

test('renders the class matching the value prop', () => {
  render(<ClassDiePicker value="Wizard" />);
  expect(screen.getByText('Wizard')).toBeInTheDocument();
});

test('updates displayed class when value prop changes', () => {
  const { rerender } = render(<ClassDiePicker value="Barbarian" />);
  expect(screen.getByText('Barbarian')).toBeInTheDocument();
  rerender(<ClassDiePicker value="Druid" />);
  expect(screen.getByText('Druid')).toBeInTheDocument();
});

test('right arrow from last class wraps to Barbarian', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onChange = jest.fn();
  render(<ClassDiePicker onChange={onChange} />);
  // advance to Wizard (11 clicks)
  for (let i = 0; i < 11; i++) {
    await user.click(screen.getByRole('button', { name: /next class/i }));
    act(() => jest.runAllTimers());
  }
  expect(screen.getByText('Wizard')).toBeInTheDocument();
  onChange.mockClear();
  await user.click(screen.getByRole('button', { name: /next class/i }));
  act(() => jest.runAllTimers());
  expect(screen.getByText('Barbarian')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith('Barbarian');
});
