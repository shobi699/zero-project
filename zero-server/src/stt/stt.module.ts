import { Module } from '@nestjs/common';
import { SttService } from './stt.service';
import { SttGateway } from './stt.gateway';
import { WhisperApiProvider } from './providers/whisper-api.provider';
import { GoogleSttProvider } from './providers/google-stt.provider';
import { AzureSttProvider } from './providers/azure-stt.provider';
import { DummyProvider } from './providers/dummy.provider';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    SttService,
    SttGateway,
    WhisperApiProvider,
    GoogleSttProvider,
    AzureSttProvider,
    DummyProvider,
  ],
  exports: [SttService],
})
export class SttModule {}
