import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { MyMemoryProvider } from './providers/mymemory.provider';
import { QuotaModule } from '../quota/quota.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QuotaModule, AuthModule],
  controllers: [TranslationController],
  providers: [TranslationService, MyMemoryProvider],
  exports: [TranslationService],
})
export class TranslationModule {}
