import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LlmService],
  controllers: [LlmController],
  exports: [LlmService],
})
export class LlmModule {}
