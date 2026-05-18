import '@testing-library/jest-dom';

// Polyfill crypto for jsdom
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}
if (typeof global.crypto.randomUUID === 'undefined') {
  let counter = 0;
  global.crypto.randomUUID = () => `test-uuid-${++counter}`;
}
if (typeof global.crypto.getRandomValues === 'undefined') {
  global.crypto.getRandomValues = (buf) => {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 0xffffffff);
    return buf;
  };
}
