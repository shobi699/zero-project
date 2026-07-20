import { Injectable, Logger } from '@nestjs/common';
import { SttProviderAdapter } from './stt-provider.interface';

@Injectable()
export class DummyProvider implements SttProviderAdapter {
  private readonly logger = new Logger(DummyProvider.name);

  getName(): string {
    return 'dummy';
  }

  async transcribe(wavBuffer: Buffer, language: string): Promise<string> {
    this.logger.log(`Dummy provider transcribing ${wavBuffer.length} bytes in language: ${language}`);
    
    // Simulate minor network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (language === 'fa') {
      return 'این یک متن آزمایشی تبدیل گفتار به نوشتار از شبیه‌ساز است.';
    } else {
      return 'This is a mock transcription text from the dummy provider.';
    }
  }
}
