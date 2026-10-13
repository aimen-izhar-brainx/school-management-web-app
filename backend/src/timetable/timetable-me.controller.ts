import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { TimetableMeService } from './timetable-me.service.js';

@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableMeController {
  constructor(private readonly me: TimetableMeService) {}

  @Get('me')
  @Roles('teacher', 'student')
  getMine(@Req() req: Request & { user: JwtPayload }) {
    return this.me.getMine(req.user.sub, req.user.role);
  }
}
