import { afterEach, describe, expect, it, vi } from 'vitest';
import * as scanner from '../../services/scanner.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('scanner service', () => {
  it('calls the relative vision endpoint', async () => {
    vi.spyOn(scanner, 'blobToBase64').mockResolvedValue('base64-image');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          name: 'Wine Name',
          producer: 'Producer',
          vintage: 2019,
          raw: 'Raw OCR'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const result = await scanner.analyzeLabel(new Blob(['image'], { type: 'image/jpeg' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/vision',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({
      type: 'label',
      raw: 'Raw OCR',
      name: 'Wine Name',
      producer: 'Producer',
      vintage: 2019
    });
  });

  it('throws API error details for non-ok responses', async () => {
    vi.spyOn(scanner, 'blobToBase64').mockResolvedValue('base64-image');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Provider down' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );

    await expect(scanner.analyzeLabel(new Blob(['image'], { type: 'image/jpeg' }))).rejects.toThrow('Provider down');
  });
});
