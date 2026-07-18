import { IsString, MinLength } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  phone!: string;
}

export class OtpVerifyDto {
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(4)
  code!: string;
}
