import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QRCode } from '@/ui/components/QRCode';
// jsQR is a dev-only dependency; it is NOT part of the bundled extension. We use
// it only to prove the rendered SVG is a genuinely scannable QR (decode
// round-trip), not just a collection of rects.
import jsQR from 'jsqr';

/** Reads the component's SVG back into a module grid and decodes it. */
function decodeRenderedSvg(container: HTMLElement): string | null {
  const svg = container.querySelector('svg');
  if (!svg) return null;
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) return null;
  const parts = viewBox.split(' ').map(Number);
  const vw = parts[2];
  const vh = parts[3];
  if (vw === undefined || vh === undefined) return null;
  const scale = 8;
  const dim = Math.round(Math.max(vw, vh)) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4);
  // Fill the whole image white first (jsQR needs white = 255 for the quiet
  // zone and light modules), then paint the black dark-module rects.
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; }
  const rects = Array.from(svg.querySelectorAll('rect'));
  // One rect per dark run (the background rect is white; skip it).
  for (const r of rects) {
    const x = Number(r.getAttribute('x') ?? 0);
    const y = Number(r.getAttribute('y') ?? 0);
    const w = Number(r.getAttribute('width') ?? 0);
    const h = Number(r.getAttribute('height') ?? 0);
    if (r.getAttribute('fill') !== '#000000') continue;
    // Fill pixels for this rect (module coordinates -> scaled pixels).
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        const pxX = Math.round(xx * scale);
        const pxY = Math.round(yy * scale);
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const i = ((pxY + dy) * dim + (pxX + dx)) * 4;
            if (pxX + dx < dim && pxY + dy < dim) {
              px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 255;
            }
          }
        }
      }
    }
  }
  const decoded = jsQR(px, dim, dim);
  return decoded ? decoded.data : null;
}

const ADDRS = [
  '0x7edc9c9f4f5b5f2b6b6b6b6b6b6b6b6b6b6b6b6b6b',
  'GDNWHQOKK5KWSWGBYUD2HOURRJTLOPQAEQZ5MFNZBX7SRWVJIF5R2VOG',
];

describe('QRCode component', () => {
  it.each(ADDRS)('renders a genuinely scannable svg for %s', (addr) => {
    const { container } = render(<QRCode value={addr} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(10);
    expect(decodeRenderedSvg(container)).toBe(addr);
  });

  it('renders nothing for an empty value', () => {
    const { container } = render(<QRCode value="" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
