import '@testing-library/jest-dom';

// Polyfill crypto.randomUUID for jsdom
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}
if (typeof global.crypto.randomUUID === 'undefined') {
  let counter = 0;
  global.crypto.randomUUID = () => `test-uuid-${++counter}`;
}
