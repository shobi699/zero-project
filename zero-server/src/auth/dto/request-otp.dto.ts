import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestOtpDto {
  @IsEmail({}, { message: 'ایمیل وارد شده معتبر نیست' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email: string;
}
