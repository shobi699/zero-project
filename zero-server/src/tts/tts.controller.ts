import { Controller, Get, Post, Body, Query, Res, UseInterceptors, UploadedFile, HttpException, HttpStatus } from '@nestjs/common';
import { TtsService } from './tts.service';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';

@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Get('models')
  async getModels() {
    return this.ttsService.getModels();
  }

  @Get('generate')
  async synthesize(
    @Query('text') text: string,
    @Query('model') model: string,
    @Query('tone') tone: string,
    @Query('speed') speed: string,
    @Query('volume') volume: string,
    @Res() res: Response
  ) {
    if (!text || !model) {
      throw new HttpException('Text and model are required', HttpStatus.BAD_REQUEST);
    }
    const speedVal = speed ? parseFloat(speed) : 1.0;
    const volumeVal = volume ? parseFloat(volume) : 1.0;
    
    const audioStream = await this.ttsService.synthesize(text, model, tone || 'normal', speedVal, volumeVal);
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="tts-output.wav"`,
    });
    audioStream.pipe(res);
  }

  @Post('clone')
  @UseInterceptors(FileInterceptor('ref_audio'))
  async cloneVoice(
    @Body('text') text: string,
    @UploadedFile() refAudio: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!text || !refAudio) {
      throw new HttpException('Text and reference audio are required', HttpStatus.BAD_REQUEST);
    }
    const audioStream = await this.ttsService.cloneVoice(text, refAudio);
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="cloned-voice.wav"`,
    });
    audioStream.pipe(res);
  }

  @Get('settings/models')
  async getSettingsModels() {
    return this.ttsService.getSettingsModels();
  }

  @Post('settings/download')
  async downloadModel(@Body('model_id') modelId: string) {
    return this.ttsService.downloadModel(modelId);
  }
}
