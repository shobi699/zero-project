import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LlmService', () => {
  let service: LlmService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    prismaService = module.get<PrismaService>(PrismaService);
    
    // Set a dummy api key for tests
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject if user is not pro', async () => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ subscription: 'free' });
    await expect(service.summarize('user1', 'text')).rejects.toThrow(HttpException);
    await expect(service.summarize('user1', 'text')).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('should summarize text successfully', async () => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ subscription: 'smart' });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          { message: { content: 'This is a summary.' } },
        ],
      },
    });

    const result = await service.summarize('user1', 'long meeting text');
    expect(result).toBe('This is a summary.');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should polish text successfully with grammar mode', async () => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ subscription: 'smart' });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          { message: { content: 'سلام خوبی؟' } },
        ],
      },
    });

    const result = await service.polish('user1', 'سلام خبی', 'grammar');
    expect(result).toBe('سلام خوبی؟');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: expect.stringContaining('نگارشی') }),
          expect.objectContaining({ role: 'user', content: 'سلام خبی' })
        ])
      }),
      expect.any(Object),
    );
  });
});
