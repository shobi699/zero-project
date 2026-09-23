import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly pythonServerUrl = 'http://127.0.0.1:8000/api';

  async getModels() {
    try {
      const response = await axios.get(`${this.pythonServerUrl}/models`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get TTS models', error);
      throw new HttpException('Failed to connect to TTS engine', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async synthesize(text: string, model: string, tone: string, speed: number = 1.0, volume: number = 1.0): Promise<any> {
    try {
      const response = await axios.get(`${this.pythonServerUrl}/tts`, {
        params: { text, model, tone, speed, volume },
        responseType: 'stream',
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to synthesize TTS', error);
      throw new HttpException('Error synthesizing speech', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async cloneVoice(text: string, refAudio: Express.Multer.File): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('ref_audio', refAudio.buffer, {
        filename: refAudio.originalname,
        contentType: refAudio.mimetype,
      });

      const response = await axios.post(`${this.pythonServerUrl}/clone`, formData, {
        headers: formData.getHeaders(),
        responseType: 'stream',
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to clone voice', error);
      throw new HttpException('Error cloning voice', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getSettingsModels() {
    try {
      const response = await axios.get(`${this.pythonServerUrl}/settings/models`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get settings models', error);
      throw new HttpException('Failed to connect to TTS engine', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async downloadModel(modelId: string) {
    try {
      const formData = new URLSearchParams();
      formData.append('model_id', modelId);
      
      const response = await axios.post(`${this.pythonServerUrl}/settings/download`, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to download TTS model', error);
      throw new HttpException('Error starting model download', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
