import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { TimetableMeService } from './timetable-me.service.js';

@Controller('timetable')
@UseGuards(JwtAuthGuard)
export class TimetableMeController {
  constructor(private readonly me: TimetableMeService) {}

  @Get('me')
  getMine(@Req() req: Request & { user: JwtPayload }) {
    return this.me.getMine(req.user.sub, req.user.role);
  }
}
