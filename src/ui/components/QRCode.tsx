import { useMemo, type JSX } from 'react';
import QRCodeLib from 'qrcode';

/**
 * Renders a scannable QR code for `value` as an inline SVG.
 *
 * Uses the `qrcode` library's encoder to produce the module matrix, then draws
 * it with contiguous dark runs per row. A quiet zone (4 modules) is added so
 * scanners can locate the code. Error-correction level L keeps the matrix small
 * (good for a 42–56 byte wallet address) while staying scannable.
 */
export function QRCode({
  value,
  size = 200,
  className = '',
}: {
  /** The string to encode (e.g. the receive address). */
  value: string;
  /** Rendered width/height in CSS pixels. */
  size?: number;
  className?: string;
}): JSX.Element | null {
  const matrix = useMemo(() => {
    try {
      // Build without rendering ops; just need the module matrix.
      return QRCodeLib.create(value, { errorCorrectionLevel: 'L' });
    } catch {
      return null;
    }
  }, [value]);

  if (matrix === null) return null;

  const modules = matrix.modules;
  const moduleCount = modules.size;

  // Render each row as contiguous dark runs (fewer rects than per-cell).
  const rows: Array<{ y: number; runs: Array<{ x: number; w: number }> }> = [];
  for (let r = 0; r < moduleCount; r += 1) {
    const runs: Array<{ x: number; w: number }> = [];
    let x = 0;
    while (x < moduleCount) {
      if (modules.get(r, x)) {
        let w = 1;
        while (x + w < moduleCount && modules.get(r, x + w)) w += 1;
        runs.push({ x, w });
        x += w;
      } else {
        x += 1;
      }
    }
    rows.push({ y: r, runs });
  }

  const quiet = 4;
  const full = moduleCount + quiet * 2;

  return (
    <svg
      viewBox={`0 0 ${full} ${full}`}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code for ${value}`}
      className={className}
    >
      <rect width={full} height={full} fill="#ffffff" />
      {rows.map((row) =>
        row.runs.map((run) => (
          <rect
            key={`${row.y}-${run.x}`}
            x={run.x + quiet}
            y={row.y + quiet}
            width={run.w}
            height={1}
            fill="#000000"
          />
        )),
      )}
    </svg>
  );
}
