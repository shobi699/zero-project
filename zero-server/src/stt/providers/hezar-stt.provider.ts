import { SttProviderAdapter } from './stt-provider.interface';
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class HezarSttProvider implements SttProviderAdapter {
  private readonly logger = new Logger(HezarSttProvider.name);
  private readonly pythonServerUrl = 'http://127.0.0.1:8000/api'; // Same as TTS engine

  getName(): string {
    return 'Hezar AI (Local)';
  }

  async transcribe(wavBuffer: Buffer, language: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('audio', wavBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      const response = await axios.post(`${this.pythonServerUrl}/stt`, formData, {
        headers: formData.getHeaders(),
      });

      if (response.data && response.data.text) {
        return response.data.text;
      }
      
      throw new Error('No text returned from Hezar');
    } catch (error: any) {
      this.logger.error(`Hezar STT Failed: ${error.message}`);
      throw new HttpException('Hezar STT service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
