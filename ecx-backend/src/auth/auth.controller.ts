import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentPrincipal } from './principal.decorator';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';

/**
 * Web login (owner / trusted contact): phone OTP → JWT. `otp/*` are @Public (the login path).
 * `me` demonstrates the JwtAuthGuard. (Voice PIN auth lives in the VoiceController via AuthService.)
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() body: OtpVerifyDto) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return principal;
  }
}
