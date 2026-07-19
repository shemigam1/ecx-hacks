import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentPrincipal } from './principal.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * Web login (owner / trusted contact): phone + numeric passcode → JWT. `login`/`register` are @Public
 * (the entry paths). `me` demonstrates the JwtAuthGuard. (The same passcode is the voice DTMF PIN,
 * verified in the VoiceController via AuthService.)
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.loginWithPasscode(body.phone, body.passcode);
  }

  @Public()
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return principal;
  }
}
