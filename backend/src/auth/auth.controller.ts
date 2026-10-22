import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { JwtPayload } from './jwt.strategy.js';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const {
      accessToken,
      refreshToken,
      rememberMe,
      refreshTokenExpiresAt,
      user,
    } = await this.auth.login(dto.email, dto.password, dto.rememberMe);
    this.setRefreshCookie(res, refreshToken, rememberMe, refreshTokenExpiresAt);
    return { token: accessToken, user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('Not signed in.');

    const {
      accessToken,
      refreshToken,
      rememberMe,
      refreshTokenExpiresAt,
      user,
    } = await this.auth.refresh(raw);
    this.setRefreshCookie(res, refreshToken, rememberMe, refreshTokenExpiresAt);
    return { token: accessToken, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { success: true };
  }

  @Get('reset-password/:token')
  checkResetToken(@Param('token') token: string) {
    return this.auth.verifyResetToken(token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: JwtPayload }) {
    return req.user;
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    rememberMe: boolean,
    expiresAt: Date,
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      // 'none' is required for the frontend and API to live on different domains; it needs `secure`,
      // which is only available once we're actually serving over HTTPS (production).
      sameSite: isProd ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      // Omitted for a non-remembered session so the cookie dies with the browser, even though
      // the underlying token is still valid server-side for JWT_REFRESH_TTL_DAYS.
      ...(rememberMe ? { expires: expiresAt } : {}),
    });
  }
}
