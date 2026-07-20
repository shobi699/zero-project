import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'ایمیل وارد شده معتبر نیست' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'کد OTP الزامی است' })
  @Length(6, 6, { message: 'کد OTP باید ۶ رقمی باشد' })
  code: string;
}
