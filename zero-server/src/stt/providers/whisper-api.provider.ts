import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SttProviderAdapter } from './stt-provider.interface';

@Injectable()
export class WhisperApiProvider implements SttProviderAdapter {
  private readonly logger = new Logger(WhisperApiProvider.name);

  getName(): string {
    return 'whisper-api';
  }

  async transcribe(wavBuffer: Buffer, language: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'mock-openai-key-or-real') {
      this.logger.warn('OpenAI API Key is not set or is mock. Falling back.');
      throw new Error('OpenAI API Key not configured');
    }

    const boundary = '----FormBoundary' + Date.now();
    const formParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
    ];

    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
    const fileTail = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(formParts.join('')),
      Buffer.from(fileHeader),
      wavBuffer,
      Buffer.from(fileTail),
    ]);

    this.logger.log('Sending transcription request to OpenAI Whisper API...');
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 15000,
      },
    );

    return response.data?.text?.trim() || '';
  }
}
