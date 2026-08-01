import { Injectable, Logger } from '@nestjs/common';
import { TranslationProviderAdapter } from './providers/translation-provider.interface';
import { MyMemoryProvider } from './providers/mymemory.provider';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private providers: Map<string, TranslationProviderAdapter> = new Map();

  constructor(myMemory: MyMemoryProvider) {
    this.providers.set(myMemory.getName(), myMemory);
  }

  /**
   * Translate text with provider failover.
   * Language codes: 'fa' (Persian), 'en' (English), 'ar' (Arabic), etc.
   */
  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    if (!text.trim()) return text;
    if (sourceLang === targetLang) return text;

    const providers = Array.from(this.providers.values());
    const errors: string[] = [];

    for (const provider of providers) {
      const start = Date.now();
      try {
        const result = await provider.translate(text, sourceLang, targetLang);
        const latency = Date.now() - start;
        this.logger.log(`Translation via ${provider.getName()} completed in ${latency}ms`);
        return result;
      } catch (err: any) {
        const latency = Date.now() - start;
        this.logger.warn(`Translation provider ${provider.getName()} failed (${latency}ms): ${err.message}`);
        errors.push(`${provider.getName()}: ${err.message}`);
      }
    }

    this.logger.error(`All translation providers failed. Errors: ${errors.join(', ')}`);
    throw new Error('ترجمه با خطا مواجه شد');
  }
}
