import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/user.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Get('providers')
  async getProviders() {
    return this.settingsService.getProviders();
  }

  @Patch('providers/:id')
  @Roles('admin')
  async updateProvider(
    @Param('id') id: string,
    @Body() updateProviderDto: UpdateProviderDto,
    @GetUser('id') adminId: string,
  ) {
    return this.settingsService.updateProvider(id, updateProviderDto, adminId);
  }

  @Patch(':key')
  @Roles('admin')
  async updateSetting(
    @Param('key') key: string,
    @Body() updateSettingDto: UpdateSettingDto,
    @GetUser('id') adminId: string,
  ) {
    return this.settingsService.updateSetting(key, updateSettingDto.value, adminId);
  }

  @Post(':key/reset')
  @Roles('admin')
  async resetSetting(@Param('key') key: string, @GetUser('id') adminId: string) {
    return this.settingsService.resetSetting(key, adminId);
  }
}
