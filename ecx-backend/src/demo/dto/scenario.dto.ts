import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Validated by the global ValidationPipe. `name` picks a canned scenario; the rest override it. */
export class ScenarioDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number; // kobo

  @IsOptional()
  @IsString()
  billerName?: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}
