import { Test, TestingModule } from '@nestjs/testing';
import { SttService } from './stt.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WhisperApiProvider } from './providers/whisper-api.provider';
import { GoogleSttProvider } from './providers/google-stt.provider';
import { AzureSttProvider } from './providers/azure-stt.provider';
import { DummyProvider } from './providers/dummy.provider';

describe('SttService', () => {
  let service: SttService;
  let prisma: PrismaService;
  let whisper: WhisperApiProvider;
  let azure: AzureSttProvider;
  let google: GoogleSttProvider;
  let dummy: DummyProvider;

  const mockPrisma = {
    sttProvider: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    usageLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockSettings = {
    getSettingValue: jest.fn(),
  };

  const mockWhisper = {
    getName: () => 'whisper-api',
    transcribe: jest.fn(),
  };

  const mockAzure = {
    getName: () => 'azure-stt',
    transcribe: jest.fn(),
  };

  const mockGoogle = {
    getName: () => 'google-stt',
    transcribe: jest.fn(),
  };

  const mockDummy = {
    getName: () => 'dummy',
    transcribe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SttService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: WhisperApiProvider, useValue: mockWhisper },
        { provide: AzureSttProvider, useValue: mockAzure },
        { provide: GoogleSttProvider, useValue: mockGoogle },
        { provide: DummyProvider, useValue: mockDummy },
      ],
    }).compile();

    service = module.get<SttService>(SttService);
    prisma = module.get<PrismaService>(PrismaService);
    whisper = module.get<WhisperApiProvider>(WhisperApiProvider);
    azure = module.get<AzureSttProvider>(AzureSttProvider);
    google = module.get<GoogleSttProvider>(GoogleSttProvider);
    dummy = module.get<DummyProvider>(DummyProvider);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transcribe with failover', () => {
    it('should use the highest priority provider when it succeeds', async () => {
      // Set up providers list (whisper-api first, then azure-stt)
      mockPrisma.sttProvider.findMany.mockResolvedValue([
        { id: '1', name: 'whisper-api', isEnabled: true, priority: 3, costPerMinute: 0.006 },
        { id: '2', name: 'azure-stt', isEnabled: true, priority: 2, costPerMinute: 0.01 },
      ]);

      mockWhisper.transcribe.mockResolvedValue('سلام دنیا');
      const pcm = Buffer.alloc(32000); // 1 second of audio at 16kHz mono 16-bit

      const result = await service.transcribe(pcm, 16000, 1, 'fa', 'user-id');

      expect(result).toBe('سلام دنیا');
      expect(mockWhisper.transcribe).toHaveBeenCalled();
      expect(mockAzure.transcribe).not.toHaveBeenCalled();
      expect(mockPrisma.usageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'whisper-api',
            status: 'SUCCESS',
            durationSec: 1,
          }),
        }),
      );
    });

    it('should failover to second provider if the first one throws an error', async () => {
      mockPrisma.sttProvider.findMany.mockResolvedValue([
        { id: '1', name: 'whisper-api', isEnabled: true, priority: 3, costPerMinute: 0.006 },
        { id: '2', name: 'azure-stt', isEnabled: true, priority: 2, costPerMinute: 0.01 },
      ]);

      mockWhisper.transcribe.mockRejectedValue(new Error('API error'));
      mockAzure.transcribe.mockResolvedValue('سلام دنیا از مایکروسافت');
      const pcm = Buffer.alloc(32000);

      const result = await service.transcribe(pcm, 16000, 1, 'fa', 'user-id');

      expect(result).toBe('سلام دنیا از مایکروسافت');
      expect(mockWhisper.transcribe).toHaveBeenCalled();
      expect(mockAzure.transcribe).toHaveBeenCalled();
      
      // Verification of logging: Whisper failed, Azure succeeded
      expect(mockPrisma.usageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'whisper-api',
            status: 'ERROR',
          }),
        }),
      );
      expect(mockPrisma.usageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'azure-stt',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('should fall back to dummy if all configured providers fail', async () => {
      mockPrisma.sttProvider.findMany.mockResolvedValue([
        { id: '1', name: 'whisper-api', isEnabled: true, priority: 3, costPerMinute: 0.006 },
      ]);

      mockWhisper.transcribe.mockRejectedValue(new Error('API error'));
      mockDummy.transcribe.mockResolvedValue('متن پیش‌فرض شبیه‌ساز');
      const pcm = Buffer.alloc(16000);

      const result = await service.transcribe(pcm, 16000, 1, 'fa', 'user-id');

      expect(result).toBe('متن پیش‌فرض شبیه‌ساز');
      expect(mockWhisper.transcribe).toHaveBeenCalled();
      expect(mockDummy.transcribe).toHaveBeenCalled();
    });
  });
});
