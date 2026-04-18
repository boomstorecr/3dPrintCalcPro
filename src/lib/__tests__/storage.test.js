// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { getLogoUrl, uploadLogo, uploadQuotePhoto } from '../storage.js';

describe('storage helpers', () => {
  it('uploadLogo returns a base64 data URL', async () => {
    const file = new File(['test content'], 'logo.png', { type: 'image/png' });

    const result = await uploadLogo('company123', file);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('uploadLogo returns the same value for the same file even with different companyIds', async () => {
    const file = new File(['same content'], 'logo.png', { type: 'image/png' });

    const resultA = await uploadLogo('companyA', file);
    const resultB = await uploadLogo('companyB', file);

    expect(resultA).toBe(resultB);
  });

  it('getLogoUrl always returns null', async () => {
    await expect(getLogoUrl('any')).resolves.toBeNull();
  });

  it('uploadQuotePhoto returns a base64 data URL', async () => {
    const file = new File(['photo content'], 'photo.png', { type: 'image/png' });

    const result = await uploadQuotePhoto('company123', 'quote456', file);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('uploadQuotePhoto ignores companyId and quoteId for conversion', async () => {
    const file = new File(['same photo'], 'photo.png', { type: 'image/png' });

    const resultA = await uploadQuotePhoto('companyA', 'quote1', file);
    const resultB = await uploadQuotePhoto('companyB', 'quote2', file);

    expect(resultA).toBe(resultB);
  });
});
