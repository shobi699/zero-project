export interface TranslationProviderAdapter {
  getName(): string;
  translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
}
