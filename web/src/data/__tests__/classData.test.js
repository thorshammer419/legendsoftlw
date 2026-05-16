import CLASSES from '../classData';

test('has exactly 12 entries', () => {
  expect(CLASSES).toHaveLength(12);
});

test('every entry has non-empty name, hit_die, imagePath, and description', () => {
  CLASSES.forEach((c) => {
    expect(c.name).toBeTruthy();
    expect(c.hit_die).toBeGreaterThan(0);
    expect(c.imagePath).toBeTruthy();
    expect(c.description).toBeTruthy();
  });
});

test('no two entries share the same name', () => {
  const names = CLASSES.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
});

test("paladin imagePath ends in .jpg; all others end in .png", () => {
  CLASSES.forEach((c) => {
    if (c.name === 'Paladin') {
      expect(c.imagePath).toMatch(/\.jpg$/);
    } else {
      expect(c.imagePath).toMatch(/\.png$/);
    }
  });
});

test("sorcerer imagePath contains 'sorceror'", () => {
  const sorcerer = CLASSES.find((c) => c.name === 'Sorcerer');
  expect(sorcerer.imagePath).toContain('sorceror');
});
