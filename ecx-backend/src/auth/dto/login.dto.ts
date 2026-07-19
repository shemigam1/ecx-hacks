import { IsNotEmpty, IsString } from 'class-validator';

/** Web login: phone + numeric passcode (the same argon2 PIN used on the voice channel). */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  passcode: string;
}
