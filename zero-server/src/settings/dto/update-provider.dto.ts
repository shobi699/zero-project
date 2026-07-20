import { IsBoolean, IsOptional, IsInt, IsNumber, Min } from 'class-validator';

export class UpdateProviderDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerMinute?: number;
}
