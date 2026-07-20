import { Test, TestingModule } from '@nestjs/testing';
import { QuotaService } from './quota.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      get: jest.fn(),
      incrbyfloat: jest.fn(),
      expire: jest.fn(),
      quit: jest.fn().mockResolvedValue(null),
    };
  });
});

describe('QuotaService', () => {
  let service: QuotaService;
  let prisma: PrismaService;
  let settings: SettingsService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockSettings = {
    getSettingValue: jest.fn().mockResolvedValue(1800),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
    prisma = module.get<PrismaService>(PrismaService);
    settings = module.get<SettingsService>(SettingsService);
    service.onModuleInit(); // Trigger redis setup mock
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLimit', () => {
    it('should return default setting value for free user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ subscription: 'free' });
      mockSettings.getSettingValue.mockResolvedValue(1800);

      const limit = await service.getLimit('user-id');
      expect(limit).toBe(1800);
    });

    it('should return high value (86400) for premium user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ subscription: 'smart' });

      const limit = await service.getLimit('user-id');
      expect(limit).toBe(86400);
    });
  });

  describe('quota checks', () => {
    it('should approve checkQuota if used < limit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ subscription: 'free' });
      mockSettings.getSettingValue.mockResolvedValue(1800);
      
      jest.spyOn(service, 'getUsed').mockResolvedValue(500);

      const hasQuota = await service.checkQuota('user-id');
      expect(hasQuota).toBe(true);
    });

    it('should reject checkQuota if used >= limit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ subscription: 'free' });
      mockSettings.getSettingValue.mockResolvedValue(1800);
      
      jest.spyOn(service, 'getUsed').mockResolvedValue(1800);

      const hasQuota = await service.checkQuota('user-id');
      expect(hasQuota).toBe(false);
    });
  });
});
