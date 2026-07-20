import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  const mockPrisma = {
    user: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn().mockReturnValue({ sub: 'user-id', email: 'test@zero.ir', role: 'user' }),
  };

  const OLD_ENV = process.env;

  beforeEach(async () => {
    process.env = { ...OLD_ENV, JWT_ACCESS_SECRET: 'test-access', JWT_REFRESH_SECRET: 'test-refresh' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwt = module.get<JwtService>(JwtService);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestOtp', () => {
    it('should generate an OTP code and upsert user', async () => {
      mockPrisma.user.upsert.mockResolvedValue({ id: 'user-id', email: 'test@zero.ir' });

      const result = await service.requestOtp('test@zero.ir');

      expect(result).toEqual({ message: 'کد تایید به ایمیل شما ارسال شد' });
      expect(mockPrisma.user.upsert).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should throw exception if no OTP request found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyOtp('test@zero.ir', '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw exception if OTP is expired', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'test@zero.ir',
        otpCode: '123456',
        otpExpiry: new Date(Date.now() - 1000), // Past
      });

      await expect(service.verifyOtp('test@zero.ir', '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw exception if OTP is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'test@zero.ir',
        otpCode: '123456',
        otpAttempts: 0,
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // Future
      });

      await expect(service.verifyOtp('test@zero.ir', '654321')).rejects.toThrow(BadRequestException);
      // Failed attempt must be counted
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@zero.ir' },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('should invalidate the code after too many failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'test@zero.ir',
        otpCode: '123456',
        otpAttempts: 5, // limit reached
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
      });

      // Even the CORRECT code must be rejected once the limit is hit
      await expect(service.verifyOtp('test@zero.ir', '123456')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@zero.ir' },
        data: { otpCode: null, otpExpiry: null },
      });
    });

    it('should clear OTP and return tokens on success', async () => {
      const user = {
        id: 'user-id',
        email: 'test@zero.ir',
        role: 'user',
        otpCode: '123456',
        otpAttempts: 0,
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.verifyOtp('test@zero.ir', '123456');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@zero.ir' },
        data: { otpCode: null, otpExpiry: null, otpAttempts: 0 },
      });
    });
  });
});
