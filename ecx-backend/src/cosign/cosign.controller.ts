import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CosignService } from './cosign.service';
import { ResolveCosignDto } from './dto/resolve-cosign.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import type { AuthPrincipal } from '../auth/auth.service';

/**
 * Trusted-contact cosign surface (F4). JWT-guarded — this is a trusted-contact-only view, and the
 * resolver's identity comes from the token, never the request body (gap #16).
 */
@Controller('cosign')
@UseGuards(JwtAuthGuard)
export class CosignController {
  constructor(private readonly cosign: CosignService) {}

  @Get('pending')
  pending() {
    return this.cosign.listPending();
  }

  @Post(':intentId/resolve')
  resolve(
    @Param('intentId') intentId: string,
    @Body() body: ResolveCosignDto,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) {
    // byUserId is taken from the JWT principal — the body's byUserId (if any) is ignored.
    return this.cosign.resolve(intentId, body.approve, principal.userId);
  }
}
