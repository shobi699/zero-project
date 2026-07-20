import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SttProviderAdapter } from './stt-provider.interface';

@Injectable()
export class GoogleSttProvider implements SttProviderAdapter {
  private readonly logger = new Logger(GoogleSttProvider.name);

  getName(): string {
    return 'google-stt';
  }

  async transcribe(wavBuffer: Buffer, language: string): Promise<string> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'mock-google-key-or-real') {
      this.logger.warn('Google STT API Key is not set or is mock. Falling back.');
      throw new Error('Google STT API Key not configured');
    }

    const encodedAudio = wavBuffer.toString('base64');
    
    // Map internal language to Google speech language code
    const langCode = language === 'fa' ? 'fa-IR' : 'en-US';

    const payload = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: langCode,
        alternativeLanguageCodes: ['en-US'],
        model: 'latest_long',
        enableAutomaticPunctuation: true,
      },
      audio: {
        content: encodedAudio,
      },
    };

    this.logger.log('Sending transcription request to Google Speech-to-Text...');
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    const results = response.data?.results;
    if (!results || !Array.isArray(results)) {
      return '';
    }

    return results
      .map((r: any) => r.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();
  }
}
