/**
 * A 5x7 bitmap font, just wide enough for the density ramps.
 *
 * Embedded rather than rendered from a webfont so effects stay pure functions
 * over ImageData: no canvas, no font-loading race, identical output in a
 * browser and in a headless test. Each glyph is 7 rows of 5 bits, MSB left.
 */
export const GLYPH_W = 5;
export const GLYPH_H = 7;

const G = (...rows: number[]) => rows;

export const FONT: Record<string, number[]> = {
  ' ': G(0, 0, 0, 0, 0, 0, 0),
  '.': G(0, 0, 0, 0, 0, 0b00100, 0),
  ':': G(0, 0b00100, 0, 0, 0b00100, 0, 0),
  '-': G(0, 0, 0, 0b01110, 0, 0, 0),
  '=': G(0, 0, 0b01110, 0, 0b01110, 0, 0),
  '+': G(0, 0, 0b00100, 0b01110, 0b00100, 0, 0),
  '*': G(0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0),
  o: G(0, 0, 0b01110, 0b10001, 0b10001, 0b01110, 0),
  x: G(0, 0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001),
  '#': G(0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010),
  '%': G(0b11001, 0b11010, 0b00100, 0b00100, 0b01011, 0b10011, 0),
  '@': G(0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110),
  '/': G(0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000),
  '\\': G(0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001),
  '|': G(0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100),
  _: G(0, 0, 0, 0, 0, 0, 0b11111),
  '8': G(0b01110, 0b10001, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110),
  W: G(0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001),
};

/** Ramps run dark-to-light in ink coverage. */
export const RAMPS: Record<string, string> = {
  standard: ' .:-=+*#%@',
  minimal: ' .:-=#@',
  blocks: ' .:ox#%@W',
  lines: ' |/-\\+*#',
  dense: ' .:-=+*ox#%@8W',
};

export const RAMP_NAMES = Object.keys(RAMPS);
