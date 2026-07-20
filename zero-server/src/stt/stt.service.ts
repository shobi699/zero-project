import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SttProviderAdapter } from './providers/stt-provider.interface';
import { WhisperApiProvider } from './providers/whisper-api.provider';
import { GoogleSttProvider } from './providers/google-stt.provider';
import { AzureSttProvider } from './providers/azure-stt.provider';
import { DummyProvider } from './providers/dummy.provider';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private providers: Map<string, SttProviderAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    whisper: WhisperApiProvider,
    google: GoogleSttProvider,
    azure: AzureSttProvider,
    dummy: DummyProvider,
  ) {
    this.providers.set(whisper.getName(), whisper);
    this.providers.set(google.getName(), google);
    this.providers.set(azure.getName(), azure);
    this.providers.set(dummy.getName(), dummy);
  }

  pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const headerSize = 44;
    const wav = Buffer.alloc(headerSize + pcm.length);

    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + pcm.length, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, headerSize);

    return wav;
  }

  async transcribe(
    pcmBuffer: Buffer,
    sampleRate: number,
    channels: number,
    language: string,
    userId: string,
  ): Promise<string> {
    const wavBuffer = this.pcmToWav(pcmBuffer, sampleRate, channels);
    
    // Calculate audio duration: 16kHz mono 16-bit PCM = 32000 bytes/sec
    const bytesPerSample = 2;
    const durationSec = pcmBuffer.length / (sampleRate * channels * bytesPerSample);

    // Fetch enabled providers ordered by priority
    const dbProviders = await this.prisma.sttProvider.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'desc' },
    });

    if (dbProviders.length === 0) {
      this.logger.error('No STT providers are enabled in the database');
      throw new Error('سیستم تبدیل گفتار موقتا در دسترس نیست');
    }

    let transcription = '';
    let success = false;
    let finalProviderName = '';
    const errors: string[] = [];

    for (const dbProvider of dbProviders) {
      const adapter = this.providers.get(dbProvider.name);
      if (!adapter) {
        this.logger.warn(`Provider adapter not found for name: ${dbProvider.name}`);
        continue;
      }

      const start = Date.now();
      try {
        transcription = await adapter.transcribe(wavBuffer, language);
        const latency = Date.now() - start;
        success = true;
        finalProviderName = dbProvider.name;

        // Update provider success count in DB (async, don't block user)
        this.prisma.sttProvider.update({
          where: { id: dbProvider.id },
          data: { successCount: { increment: 1 } },
        }).catch(err => this.logger.warn(`Failed to update provider successCount: ${err.message}`));

        // Log usage to PostgreSQL
        const cost = (durationSec / 60) * dbProvider.costPerMinute;
        await this.prisma.usageLog.create({
          data: {
            userId,
            provider: dbProvider.name,
            durationSec,
            cost,
            status: 'SUCCESS',
            latencyMs: latency,
          },
        });

        break; // Stop and return on success
      } catch (err: any) {
        const latency = Date.now() - start;
        const errMsg = err.message || err.toString();
        this.logger.warn(`STT provider ${dbProvider.name} failed: ${errMsg}`);
        errors.push(`${dbProvider.name}: ${errMsg}`);

        // Update provider failure count
        this.prisma.sttProvider.update({
          where: { id: dbProvider.id },
          data: { failureCount: { increment: 1 } },
        }).catch(e => this.logger.warn(`Failed to update provider failureCount: ${e.message}`));

        // Log usage as error
        await this.prisma.usageLog.create({
          data: {
            userId,
            provider: dbProvider.name,
            durationSec,
            cost: 0,
            status: 'ERROR',
            latencyMs: latency,
          },
        }).catch(e => this.logger.warn(`Failed to log usage: ${e.message}`));
      }
    }

    if (!success) {
      this.logger.error(`All STT providers failed. Errors: ${errors.join(', ')}`);
      // Fallback to dummy if dummy is not already tried
      const dummyAdapter = this.providers.get('dummy');
      if (dummyAdapter && !dbProviders.some(p => p.name === 'dummy')) {
        this.logger.log('All configured providers failed. Falling back to Dummy provider.');
        transcription = await dummyAdapter.transcribe(wavBuffer, language);
        return transcription;
      }
      throw new Error('تبدیل گفتار با خطا مواجه شد. لطفا دوباره تلاش کنید.');
    }

    return transcription;
  }
}
