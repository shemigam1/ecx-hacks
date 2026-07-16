import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, IsObject } from 'class-validator';
import type { Channel, Kobo } from '../../contracts';
import type { InitiatePaymentInput } from '../../contracts';

export class InitiatePaymentDto implements InitiatePaymentInput {
  @IsString()
  @IsNotEmpty()
  credentialId: string;

  @IsEnum(['VOICE', 'WHATSAPP', 'WEB'])
  channel: Channel;

  @IsOptional()
  @IsString()
  billerId?: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsInt()
  @Min(1)
  amount: Kobo;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
