import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** Validated by the global ValidationPipe (whitelist + transform). */
export class ResolveCosignDto {
  @IsBoolean()
  approve!: boolean;

  /** Ignored — the resolver's identity comes from the JWT principal (gap #16). Kept optional for BC. */
  @IsOptional()
  @IsString()
  byUserId?: string;
}
