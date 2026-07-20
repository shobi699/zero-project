import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SttProviderAdapter } from './stt-provider.interface';

@Injectable()
export class AzureSttProvider implements SttProviderAdapter {
  private readonly logger = new Logger(AzureSttProvider.name);

  getName(): string {
    return 'azure-stt';
  }

  async transcribe(wavBuffer: Buffer, language: string): Promise<string> {
    const key = process.env.AZURE_STT_KEY;
    const region = process.env.AZURE_STT_REGION || 'eastus';

    if (!key || key === 'mock-azure-key-or-real') {
      this.logger.warn('Azure STT Key is not set or is mock. Falling back.');
      throw new Error('Azure STT Key not configured');
    }

    const langCode = language === 'fa' ? 'fa-IR' : 'en-US';
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${langCode}&format=detailed`;

    this.logger.log('Sending transcription request to Azure Speech Services...');
    const response = await axios.post(url, wavBuffer, {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      },
      timeout: 15000,
    });

    const parsed = response.data;
    return parsed?.DisplayText || parsed?.NBest?.[0]?.Display || '';
  }
}
