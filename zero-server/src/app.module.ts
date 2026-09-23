import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { QuotaModule } from './quota/quota.module';
import { SttModule } from './stt/stt.module';
import { TranslationModule } from './translation/translation.module';
import { TtsModule } from './tts/tts.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SettingsModule,
    AuthModule,
    QuotaModule,
    SttModule,
    TranslationModule,
    TtsModule,
    LlmModule,
  ],
})
export class AppModule {}
