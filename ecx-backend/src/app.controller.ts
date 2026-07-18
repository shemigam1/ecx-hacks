import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Health at /health so that `/` falls through to the served SPA (gap #18).
  @Public()
  @Get('health')
  getHello(): string {
    return this.appService.getHello();
  }
}
