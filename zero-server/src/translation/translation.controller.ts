import { Controller, Post, Body, UseGuards, Request, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TranslationService } from './translation.service';
import { QuotaService } from '../quota/quota.service';

class TranslateDto {
  text: string;
  sourceLang: string;
  targetLang: string;
}

@Controller('translation')
export class TranslationController {
  private readonly logger = new Logger(TranslationController.name);

  constructor(
    private readonly translationService: TranslationService,
    private readonly quotaService: QuotaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async translate(@Body() dto: TranslateDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      return { error: 'کاربر شناسایی نشد' };
    }

    // Check translation quota
    const hasQuota = await this.checkTranslateQuota(userId);
    if (!hasQuota) {
      return { error: 'سهمیه ترجمه ماه جاری شما به پایان رسیده است' };
    }

    try {
      const result = await this.translationService.translate(
        dto.text,
        dto.sourceLang,
        dto.targetLang,
      );

      // Consume quota (1 second per 100 characters)
      const chars = dto.text.length;
      const durationSec = Math.max(1, chars / 100);
      await this.consumeTranslateQuota(userId, durationSec);

      return { text: result };
    } catch (err: any) {
      this.logger.error(`Translation failed: ${err.message}`);
      return { error: err.message || 'خطا در ترجمه' };
    }
  }

  private async checkTranslateQuota(userId: string): Promise<boolean> {
    const key = `quota:translate:${userId}:${this.getYearMonth()}`;
    // Reuse the same Redis/fallback pattern as main quota
    // For simplicity, use 10000 chars/day limit
    const used = await this.getTranslateUsed(userId);
    return used < 10000;
  }

  private async consumeTranslateQuota(userId: string, chars: number): Promise<void> {
    // Store in settings or a simple in-memory map for now
    const key = `translate:${userId}:${this.getYearMonth()}`;
    this.translateUsage.set(key, (this.translateUsage.get(key) || 0) + chars);
  }

  private async getTranslateUsed(userId: string): Promise<number> {
    const key = `translate:${userId}:${this.getYearMonth()}`;
    return this.translateUsage.get(key) || 0;
  }

  private translateUsage = new Map<string, number>();

  private getYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
