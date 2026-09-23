import { Injectable, OnModuleInit, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedProviders();
      await this.seedSettings();
    } catch (e) {
      this.logger.error('Failed to seed settings and providers', e);
    }
  }

  private async seedProviders() {
    const count = await this.prisma.sttProvider.count();
    if (count === 0) {
      this.logger.log('Seeding default STT providers...');
      await this.prisma.sttProvider.createMany({
        data: [
          { name: 'whisper-api', isEnabled: true, priority: 3, costPerMinute: 0.006 },
          { name: 'azure-stt', isEnabled: true, priority: 2, costPerMinute: 0.010 },
          { name: 'google-stt', isEnabled: true, priority: 1, costPerMinute: 0.024 },
          { name: 'dummy', isEnabled: true, priority: 0, costPerMinute: 0.000 },
        ],
      });
    }
  }

  private async seedSettings() {
    const count = await this.prisma.setting.count();
    if (count === 0) {
      this.logger.log('Seeding default settings...');
      await this.prisma.setting.createMany({
        data: [
          {
            key: 'quota.free.monthly_limit_sec',
            label: 'سهمیه ماهانه رایگان (ثانیه)',
            description: 'میزان سهمیه مکالمه ابری رایگان کاربران در ماه به ثانیه',
            type: 'number',
            value: '1800',
            defaultValue: '1800',
            category: 'Quota',
            min: 0,
          },
          {
            key: 'stt.failover_timeout_ms',
            label: 'زمان انتظار قبل از Failover (میلی‌ثانیه)',
            description: 'مدت زمان تلاش برای یک ارائه‌دهنده پیش از سوییچ به بعدی در صورت عدم پاسخ',
            type: 'number',
            value: '5000',
            defaultValue: '5000',
            category: 'STT',
            min: 1000,
            max: 30000,
          },
          {
            key: 'stt.default_provider',
            label: 'ارائه‌دهنده پیش‌فرض',
            description: 'ارائه‌دهنده اولویت اول برای کاربران ابری',
            type: 'text',
            value: 'whisper-api',
            defaultValue: 'whisper-api',
            category: 'STT',
          },
        ],
      });
    }
  }

  async getSettings() {
    return this.prisma.setting.findMany();
  }

  async getRemoteConfig() {
    const settings = await this.prisma.setting.findMany({
      where: {
        isEnabled: true,
      },
    });
    
    const config: Record<string, any> = {};
    for (const setting of settings) {
      if (setting.type === 'number') {
        config[setting.key] = Number(setting.value);
      } else if (setting.type === 'boolean') {
        config[setting.key] = setting.value === 'true';
      } else {
        config[setting.key] = setting.value;
      }
    }
    
    // Also include active STT providers priority list
    const providers = await this.getProviders();
    config['stt.providers'] = providers
      .filter((p: any) => p.isEnabled)
      .sort((a: any, b: any) => b.priority - a.priority)
      .map((p: any) => p.name);

    return config;
  }

  async getSetting(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) {
      throw new NotFoundException(`تنظیم با کلید ${key} یافت نشد`);
    }
    return setting;
  }

  async getSettingValue<T = string>(key: string, fallback: T): Promise<T> {
    try {
      const setting = await this.prisma.setting.findUnique({ where: { key, isEnabled: true } });
      if (!setting) return fallback;
      if (setting.type === 'number') return Number(setting.value) as unknown as T;
      if (setting.type === 'boolean') return (setting.value === 'true') as unknown as T;
      return setting.value as unknown as T;
    } catch {
      return fallback;
    }
  }

  async updateSetting(key: string, value: string, adminId: string) {
    const setting = await this.getSetting(key);

    // Validation
    if (setting.type === 'number') {
      const numVal = Number(value);
      if (isNaN(numVal)) {
        throw new BadRequestException('مقدار باید یک عدد معتبر باشد');
      }
      if (setting.min !== null && numVal < setting.min) {
        throw new BadRequestException(`مقدار نمی‌تواند کمتر از ${setting.min} باشد`);
      }
      if (setting.max !== null && numVal > setting.max) {
        throw new BadRequestException(`مقدار نمی‌تواند بیشتر از ${setting.max} باشد`);
      }
    } else if (setting.type === 'boolean') {
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException('مقدار باید true یا false باشد');
      }
    }

    const updated = await this.prisma.setting.update({
      where: { key },
      data: { value },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_SETTING',
        details: `تنظیم ${key} توسط مدیر ${adminId} از ${setting.value} به ${value} تغییر یافت.`,
      },
    });

    return updated;
  }

  async resetSetting(key: string, adminId: string) {
    const setting = await this.getSetting(key);
    const updated = await this.prisma.setting.update({
      where: { key },
      data: { value: setting.defaultValue },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'RESET_SETTING',
        details: `تنظیم ${key} توسط مدیر ${adminId} به مقدار پیش‌فرض (${setting.defaultValue}) بازگردانی شد.`,
      },
    });

    return updated;
  }

  async getProviders() {
    return this.prisma.sttProvider.findMany({
      orderBy: { priority: 'desc' },
    });
  }

  async updateProvider(id: string, data: any, adminId: string) {
    const provider = await this.prisma.sttProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`ارائه‌دهنده با شناسه ${id} یافت نشد`);
    }

    const updated = await this.prisma.sttProvider.update({
      where: { id },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_PROVIDER',
        details: `ارائه‌دهنده ${provider.name} توسط مدیر ${adminId} ویرایش شد: ${JSON.stringify(data)}`,
      },
    });

    return updated;
  }
}
