import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

describe('cn', () => {
  it('lets the last conflicting Tailwind utility win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('text-ink', false && 'hidden', undefined, 'font-sans')).toBe('text-ink font-sans');
  });
});
