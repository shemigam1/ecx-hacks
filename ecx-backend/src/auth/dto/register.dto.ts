import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { Kobo } from '../../contracts';

/**
 * Owner self-serve onboarding (web). The owner sets a numeric passcode (stored as an argon2 PIN);
 * we then provision the whole account graph (User + Account + AI-agent Credential + PolicyRules)
 * inside AuthService.register. Money fields are integer kobo — the web client multiplies naira by 100.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  /** At least 4 digits; becomes the login + voice passcode. */
  @Matches(/^\d{4,}$/, { message: 'passcode must be at least 4 digits' })
  passcode: string;

  /** Most the AI assistant may spend in a calendar month. */
  @IsInt()
  @Min(1)
  monthlyCapKobo: Kobo;

  /** Payments at or above this need a trusted contact to co-sign. */
  @IsInt()
  @Min(0)
  cosignThresholdKobo: Kobo;

  /** Optional per-payment ceiling; defaults to the cosign threshold when omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  perTxCapKobo?: Kobo;

  /** Optional trusted contact to add during onboarding (name + phone). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  trustedContactName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  trustedContactPhone?: string;
}
