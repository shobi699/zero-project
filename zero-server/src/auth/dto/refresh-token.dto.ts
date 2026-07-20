import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'توکن نوسازی الزامی است' })
  refreshToken: string;
}
