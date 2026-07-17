import { IsBoolean, IsString } from 'class-validator';

/** Validated by the global ValidationPipe (whitelist + transform). */
export class ResolveCosignDto {
  @IsBoolean()
  approve!: boolean;

  @IsString()
  byUserId!: string;
}
