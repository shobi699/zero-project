import { Injectable, Logger } from '@nestjs/common';
import { TranslationProviderAdapter } from './translation-provider.interface';

/**
 * MyMemory Translation API — free, no API key required.
 * Limit: ~5000 chars/day without key, more with key.
 * https://mymemory.translated.net/doc/spec.php
 */
@Injectable()
export class MyMemoryProvider implements TranslationProviderAdapter {
  private readonly logger = new Logger(MyMemoryProvider.name);
  private readonly baseUrl = 'https://api.mymemory.translated.net/get';

  getName(): string {
    return 'mymemory';
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    const params = new URLSearchParams({
      q: text,
      langpair: `${sourceLang}|${targetLang}`,
    });

    // Add email for higher quota if available
    const email = process.env.MYMEMORY_EMAIL;
    if (email) {
      params.set('de', email);
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`MyMemory API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.responseStatus !== 200 && data.responseStatus !== '200') {
      throw new Error(`MyMemory translation failed: ${data.responseDetails || 'unknown error'}`);
    }

    return data.responseData?.translatedText || text;
  }
}
