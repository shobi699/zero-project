import { Injectable, UnauthorizedException, Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Emails granted the admin role, configured via ADMIN_EMAILS (comma-separated). */
  private isAdminEmail(email: string): boolean {
    const admins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return admins.includes(email.toLowerCase());
  }

  private accessSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  private refreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }

  async requestOtp(email: string): Promise<{ message: string }> {
    // Generate a 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // Only assign the admin role to emails on the configured allowlist, and
    // only when the user is first created — never silently escalate an existing
    // user (and never hardcode an admin address in source).
    const role = this.isAdminEmail(email) ? 'admin' : 'user';

    await this.prisma.user.upsert({
      where: { email },
      update: {
        otpCode: code,
        otpExpiry: expiry,
        otpAttempts: 0,
      },
      create: {
        email,
        otpCode: code,
        otpExpiry: expiry,
        otpAttempts: 0,
        role,
      },
    });

    // Never log the OTP in production; only surface it in development to aid
    // local testing without an email provider.
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[OTP Request - DEV ONLY] Email: ${email} | Code: ${code} (Expires: ${expiry.toISOString()})`,
      );
    } else {
      this.logger.log(`OTP requested for ${email}`);
    }

    // In a real application, you'd send this email here.
    return { message: 'کد تایید به ایمیل شما ارسال شد' };
  }

  async verifyOtp(email: string, code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('هیچ درخواست کدی برای این ایمیل یافت نشد');
    }

    if (user.otpExpiry < new Date()) {
      throw new BadRequestException('کد تایید منقضی شده است. لطفا مجددا تلاش کنید');
    }

    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      // Invalidate the code so a new one must be requested.
      await this.prisma.user.update({
        where: { email },
        data: { otpCode: null, otpExpiry: null },
      });
      throw new BadRequestException(
        'تعداد تلاش‌های مجاز به پایان رسید. لطفا کد جدید درخواست کنید',
      );
    }

    if (user.otpCode !== code) {
      await this.prisma.user.update({
        where: { email },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('کد تایید نادرست است');
    }

    // Clear OTP code and reset the attempt counter after successful verification
    await this.prisma.user.update({
      where: { email },
      data: {
        otpCode: null,
        otpExpiry: null,
        otpAttempts: 0,
      },
    });

    return this.generateTokens(user.id, user.email, user.role);
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshSecret(),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('کاربر یافت نشد');
      }

      return this.generateTokens(user.id, user.email, user.role);
    } catch (e) {
      throw new UnauthorizedException('توکن نوسازی نامعتبر یا منقضی شده است');
    }
  }

  private generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret(),
      expiresIn: '1d', // Access token valid for 1 day (generous for development)
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret(),
      expiresIn: '30d', // Refresh token valid for 30 days
    });

    return { accessToken, refreshToken };
  }
}
