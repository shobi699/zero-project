export interface SttProviderAdapter {
  getName(): string;
  transcribe(wavBuffer: Buffer, language: string): Promise<string>;
}
