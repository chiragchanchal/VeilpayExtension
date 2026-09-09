import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from '@/ui/components/Icon';
import { BrandLogo } from '@/ui/components/BrandLogo';

describe('Icon', () => {
  it('renders an image with a source for a known icon name', () => {
    const { container } = render(<Icon name="check" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // Vite inlines small SVGs as a data: URI (test build) rather than a file.
    expect(img!.getAttribute('src')).not.toBeNull();
  });

  it('accepts a className to size the icon', () => {
    const { container } = render(<Icon name="lock" className="h-6 w-6" />);
    expect(container.querySelector('img')).toHaveClass('h-6', 'w-6');
  });

  it('marks the icon as decorative when no label is provided', () => {
    const { container } = render(<Icon name="key" />);
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('BrandLogo', () => {
  it('renders the brand logo SVG', () => {
    const { container } = render(<BrandLogo />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).not.toBeNull();
    expect(img!.getAttribute('alt')).toBe('Veilpay');
  });
});
