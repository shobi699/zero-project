import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LlmService } from './llm.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/user.decorator';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('summarize')
  async summarize(@Body('text') text: string, @GetUser('id') userId: string) {
    if (!text) {
      return { summary: '' };
    }
    const summary = await this.llmService.summarize(userId, text);
    return { summary };
  }

  @Post('polish')
  async polish(@Body('text') text: string, @Body('mode') mode: string, @GetUser('id') userId: string) {
    if (!text || !mode || mode === 'off') {
      return { text };
    }
    const polishedText = await this.llmService.polish(userId, text, mode);
    return { text: polishedText };
  }
}
