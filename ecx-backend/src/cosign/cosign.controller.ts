import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CosignService } from './cosign.service';
import { ResolveCosignDto } from './dto/resolve-cosign.dto';

/** Trusted-contact cosign surface (F4). `GET /cosign/pending`, `POST /cosign/:intentId/resolve`. */
@Controller('cosign')
export class CosignController {
  constructor(private readonly cosign: CosignService) {}

  @Get('pending')
  pending() {
    return this.cosign.listPending();
  }

  @Post(':intentId/resolve')
  resolve(@Param('intentId') intentId: string, @Body() body: ResolveCosignDto) {
    return this.cosign.resolve(intentId, body.approve, body.byUserId);
  }
}
