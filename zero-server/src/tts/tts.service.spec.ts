import { Test, TestingModule } from '@nestjs/testing';
import { TtsService } from './tts.service';
import axios from 'axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as FormData from 'form-data';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TtsService', () => {
  let service: TtsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TtsService],
    }).compile();

    service = module.get<TtsService>(TtsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getModels', () => {
    it('should fetch TTS models successfully', async () => {
      const mockData = { models: ['model1'] };
      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      const result = await service.getModels();
      expect(result).toEqual(mockData);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1:8000/api/models');
    });

    it('should throw an HttpException if axios fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      await expect(service.getModels()).rejects.toThrow(HttpException);
      await expect(service.getModels()).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });
  });

  describe('synthesize', () => {
    it('should request synthesis stream successfully', async () => {
      const mockStream = 'stream-data';
      mockedAxios.get.mockResolvedValueOnce({ data: mockStream });

      const result = await service.synthesize('hello', 'model1', 'neutral', 1.0, 1.0);
      expect(result).toBe(mockStream);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1:8000/api/tts', {
        params: { text: 'hello', model: 'model1', tone: 'neutral', speed: 1.0, volume: 1.0 },
        responseType: 'stream',
      });
    });

    it('should throw HttpException if synthesis fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Synth error'));
      await expect(service.synthesize('hello', 'model1', 'neutral')).rejects.toThrow(HttpException);
    });
  });

  describe('cloneVoice', () => {
    it('should request cloning stream successfully', async () => {
      const mockStream = 'stream-data';
      mockedAxios.post.mockResolvedValueOnce({ data: mockStream });

      const mockFile: Express.Multer.File = {
        buffer: Buffer.from('audio'),
        originalname: 'test.wav',
        mimetype: 'audio/wav',
      } as any;

      const result = await service.cloneVoice('hello', mockFile);
      expect(result).toBe(mockStream);
      expect(mockedAxios.post).toHaveBeenCalledWith('http://127.0.0.1:8000/api/clone', expect.any(FormData), {
        headers: expect.any(Object),
        responseType: 'stream',
      });
    });
  });

  describe('getSettingsModels', () => {
    it('should fetch settings models successfully', async () => {
      const mockData = { available: ['m1'] };
      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      const result = await service.getSettingsModels();
      expect(result).toEqual(mockData);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1:8000/api/settings/models');
    });
  });

  describe('downloadModel', () => {
    it('should start download model successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      const result = await service.downloadModel('m1');
      expect(result).toEqual({ success: true });
      expect(mockedAxios.post).toHaveBeenCalledWith('http://127.0.0.1:8000/api/settings/download', 'model_id=m1', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    });
  });
});
