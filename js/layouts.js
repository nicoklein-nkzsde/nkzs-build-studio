// Tastatur-Layouts (ANSI). Einheit = 1u (19,05 mm). code = KeyboardEvent.code
const K = (l, w = 1, code = null, role = 'alpha', h = 1) => ({ l, w, code, role, h });
const G = (w) => ({ gap: w });
const letters = (s) => s.split('').map((ch) => K(ch, 1, 'Key' + ch));
const F = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => K('F' + (a + i), 1, 'F' + (a + i), 'mod'));

const digits = [...'1234567890'].map((d) => K(d, 1, 'Digit' + d));
const numRow = (first) => [first, ...digits, K('-', 1, 'Minus'), K('=', 1, 'Equal'), K('⌫', 2, 'Backspace', 'mod')];
const escKey = K('Esc', 1, ['Escape', 'Backquote'], 'accent');
const tildeKey = K('`', 1, 'Backquote');
const qRow = () => [K('Tab', 1.5, 'Tab', 'mod'), ...letters('QWERTYUIOP'), K('[', 1, 'BracketLeft'), K(']', 1, 'BracketRight'), K('\\', 1.5, 'Backslash', 'mod')];
const aRow = () => [K('Caps', 1.75, 'CapsLock', 'mod'), ...letters('ASDFGHJKL'), K(';', 1, 'Semicolon'), K("'", 1, 'Quote'), K('Enter', 2.25, 'Enter', 'accent')];
const zRow = (rs) => [K('Shift', 2.25, 'ShiftLeft', 'mod'), ...letters('ZXCVBNM'), K(',', 1, 'Comma'), K('.', 1, 'Period'), K('/', 1, 'Slash'), K('Shift', rs, 'ShiftRight', 'mod')];
const bot60 = () => [K('Ctrl', 1.25, 'ControlLeft', 'mod'), K('Win', 1.25, 'MetaLeft', 'mod'), K('Alt', 1.25, 'AltLeft', 'mod'), K('', 6.25, 'Space', 'alpha'), K('Alt', 1.25, 'AltRight', 'mod'), K('Win', 1.25, 'MetaRight', 'mod'), K('Menu', 1.25, 'ContextMenu', 'mod'), K('Ctrl', 1.25, 'ControlRight', 'mod')];
const bot65 = () => [K('Ctrl', 1.25, 'ControlLeft', 'mod'), K('Win', 1.25, 'MetaLeft', 'mod'), K('Alt', 1.25, 'AltLeft', 'mod'), K('', 6.25, 'Space', 'alpha'), K('Alt', 1, 'AltRight', 'mod'), K('Fn', 1, null, 'mod'), K('Ctrl', 1, 'ControlRight', 'mod'), K('←', 1, 'ArrowLeft', 'mod'), K('↓', 1, 'ArrowDown', 'mod'), K('→', 1, 'ArrowRight', 'mod')];

const L = {
  '60': [[numRow(escKey)], [qRow()], [aRow()], [zRow(2.75)], [bot60()]],
  '65': [
    [[...numRow(escKey), K('Del', 1, 'Delete', 'mod')]],
    [[...qRow(), K('PgUp', 1, 'PageUp', 'mod')]],
    [[...aRow(), K('PgDn', 1, 'PageDown', 'mod')]],
    [[...zRow(1.75), K('↑', 1, 'ArrowUp', 'mod'), K('End', 1, 'End', 'mod')]],
    [bot65()],
  ],
  '75': [
    [[K('Esc', 1, 'Escape', 'accent'), ...F(1, 12), K('Prt', 1, 'PrintScreen', 'mod'), K('Ins', 1, 'Insert', 'mod'), K('Del', 1, 'Delete', 'mod')], 0.25],
    [[...numRow(tildeKey), K('Home', 1, 'Home', 'mod')]],
    [[...qRow(), K('PgUp', 1, 'PageUp', 'mod')]],
    [[...aRow(), K('PgDn', 1, 'PageDown', 'mod')]],
    [[...zRow(1.75), K('↑', 1, 'ArrowUp', 'mod'), K('End', 1, 'End', 'mod')]],
    [bot65()],
  ],
};

const fRowTKL = () => [K('Esc', 1, 'Escape', 'accent'), G(1), ...F(1, 4), G(0.5), ...F(5, 8), G(0.5), ...F(9, 12), G(0.25), K('Prt', 1, 'PrintScreen', 'mod'), K('Scr', 1, 'ScrollLock', 'mod'), K('Pse', 1, 'Pause', 'mod')];
L['TKL'] = [
  [fRowTKL(), 0.25],
  [[...numRow(tildeKey), G(0.25), K('Ins', 1, 'Insert', 'mod'), K('Home', 1, 'Home', 'mod'), K('PgUp', 1, 'PageUp', 'mod')]],
  [[...qRow(), G(0.25), K('Del', 1, 'Delete', 'mod'), K('End', 1, 'End', 'mod'), K('PgDn', 1, 'PageDown', 'mod')]],
  [aRow()],
  [[...zRow(2.75), G(1.25), K('↑', 1, 'ArrowUp', 'mod')]],
  [[...bot60(), G(0.25), K('←', 1, 'ArrowLeft', 'mod'), K('↓', 1, 'ArrowDown', 'mod'), K('→', 1, 'ArrowRight', 'mod')]],
];
L['100'] = [
  [fRowTKL(), 0.25],
  [[...numRow(tildeKey), G(0.25), K('Ins', 1, 'Insert', 'mod'), K('Home', 1, 'Home', 'mod'), K('PgUp', 1, 'PageUp', 'mod'), G(0.25), K('Num', 1, 'NumLock', 'mod'), K('/', 1, 'NumpadDivide', 'mod'), K('*', 1, 'NumpadMultiply', 'mod'), K('-', 1, 'NumpadSubtract', 'mod')]],
  [[...qRow(), G(0.25), K('Del', 1, 'Delete', 'mod'), K('End', 1, 'End', 'mod'), K('PgDn', 1, 'PageDown', 'mod'), G(0.25), K('7', 1, 'Numpad7'), K('8', 1, 'Numpad8'), K('9', 1, 'Numpad9'), K('+', 1, 'NumpadAdd', 'mod', 2)]],
  [[...aRow(), G(3.5), K('4', 1, 'Numpad4'), K('5', 1, 'Numpad5'), K('6', 1, 'Numpad6')]],
  [[...zRow(2.75), G(1.25), K('↑', 1, 'ArrowUp', 'mod'), G(1.25), K('1', 1, 'Numpad1'), K('2', 1, 'Numpad2'), K('3', 1, 'Numpad3'), K('Ent', 1, 'NumpadEnter', 'accent', 2)]],
  [[...bot60(), G(0.25), K('←', 1, 'ArrowLeft', 'mod'), K('↓', 1, 'ArrowDown', 'mod'), K('→', 1, 'ArrowRight', 'mod'), G(0.25), K('0', 2, 'Numpad0'), K('.', 1, 'NumpadDecimal')]],
];

const cache = {};
export function layoutKeys(name) {
  if (cache[name]) return cache[name];
  const rows = L[name] || L['65'];
  const keys = [];
  let y = 0;
  rows.forEach(([items, gapAfter = 0], r) => {
    let x = 0;
    for (const it of items) {
      if (it.gap) { x += it.gap; continue; }
      keys.push({ ...it, x, y, row: rows.length - 1 - r, codes: it.code ? [].concat(it.code) : [] });
      x += it.w;
    }
    y += 1 + gapAfter;
  });
  const width = Math.max(...keys.map((k) => k.x + k.w));
  const depth = Math.max(...keys.map((k) => k.y + k.h));
  return (cache[name] = { keys, width, depth, count: keys.length });
}
