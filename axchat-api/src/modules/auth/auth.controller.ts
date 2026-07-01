import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../../common/guards';
import { LoginThrottleGuard } from './login-throttle.guard';
import { CurrentUser } from '../../common/decorators';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from './auth-cookie.util';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(LoginThrottleGuard)
  @ApiOperation({ summary: 'Register new user + organization' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    setRefreshCookie(res, result.refreshToken, this.config);
    return result;
  }

  @Post('login')
  @UseGuards(LoginThrottleGuard)
  @ApiOperation({ summary: 'Login with email/password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    setRefreshCookie(res, result.refreshToken, this.config);
    return result;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token (cookie httpOnly ou body)' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Precedência ao body: a impersonação carrega o refresh no body e NÃO deve
    // tocar no cookie do super admin. Sessões normais não mandam body → cookie.
    const bodyToken = dto.refreshToken;
    const token = bodyToken || readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokens = await this.authService.refresh(token);
    // Só (re)grava o cookie quando o refresh veio do PRÓPRIO cookie (sessão
    // normal). Se veio do body, preserva o cookie atual (admin impersonando).
    if (!bodyToken) {
      setRefreshCookie(res, tokens.refreshToken, this.config);
    }
    return tokens;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear the refresh cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    clearRefreshCookie(res, this.config);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile + organizations' })
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }
}
