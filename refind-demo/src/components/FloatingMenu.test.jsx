import { describe, expect, it } from 'vitest';
import { placeFloatingMenu } from './FloatingMenu.jsx';

describe('placeFloatingMenu', () => {
  const viewport = { viewportWidth: 400, viewportHeight: 300 };

  it('opens below the anchor when there is room', () => {
    const coords = placeFloatingMenu(
      { top: 40, left: 20, right: 80, bottom: 60, width: 60, height: 20 },
      { menuWidth: 150, menuHeight: 80, ...viewport },
    );
    expect(coords.top).toBe(66);
    expect(coords.bottom).toBe('auto');
    expect(coords.left).toBe(20);
    expect(coords.width).toBe(150);
    expect(coords.maxWidth).toBe(150);
  });

  it('opens above when the viewport bottom would clip the menu', () => {
    const coords = placeFloatingMenu(
      { top: 240, left: 20, right: 80, bottom: 260, width: 60, height: 20 },
      { menuWidth: 150, menuHeight: 80, ...viewport },
    );
    expect(coords.top).toBe('auto');
    expect(coords.bottom).toBeGreaterThan(0);
  });

  it('keeps a fixed width even when the selection rect is very wide', () => {
    const coords = placeFloatingMenu(
      { top: 40, left: 20, right: 380, bottom: 60, width: 360, height: 20 },
      { menuWidth: 168, menuHeight: 80, preferCenter: true, ...viewport },
    );
    expect(coords.width).toBe(168);
    expect(coords.maxWidth).toBe(168);
    expect(coords.left).toBeGreaterThanOrEqual(8);
    expect(coords.left + coords.width).toBeLessThanOrEqual(400 - 8);
  });

  it('keeps centered selection menus inside horizontal bounds', () => {
    const coords = placeFloatingMenu(
      { top: 40, left: 350, right: 390, bottom: 60, width: 40, height: 20 },
      { menuWidth: 160, menuHeight: 80, preferCenter: true, ...viewport },
    );
    expect(coords.left).toBeLessThanOrEqual(400 - 8 - 160);
    expect(coords.left).toBeGreaterThanOrEqual(8);
  });

  it('clamps left edge near zero', () => {
    const coords = placeFloatingMenu(
      { top: 40, left: 2, right: 30, bottom: 60, width: 28, height: 20 },
      { menuWidth: 160, menuHeight: 80, preferCenter: true, ...viewport },
    );
    expect(coords.left).toBe(8);
  });
});
