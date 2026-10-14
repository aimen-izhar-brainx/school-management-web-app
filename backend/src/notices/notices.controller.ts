import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { ListNoticesDto } from './dto/list-notices.dto.js';
import { NoticesService } from './notices.service.js';

type AuthedRequest = Request & { user: JwtPayload };

@Controller('notices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  /** Notices the caller may see, newest first. */
  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListNoticesDto) {
    return this.notices.list(req.user.sub, req.user.role, query.limit);
  }

  @Post()
  @Roles('admin', 'teacher')
  create(@Req() req: AuthedRequest, @Body() dto: CreateNoticeDto) {
    return this.notices.create(req.user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('admin', 'teacher')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notices.remove(id, req.user.sub, req.user.role);
  }
}
