import {Body,Controller,Delete,Get,HttpCode,HttpStatus,Param,Post,Query,UseGuards,} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import {
  NoticeService,
  type NoticePage,
  type NoticeView,
} from './notice.service.js';

@Controller('notices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoticeController {
  constructor(private readonly notices: NoticeService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ): Promise<NoticePage> {
    return this.notices.findAll(user.role, pagination);
  }

  @Post()
  @Roles('admin', 'teacher')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNoticeDto,
  ): Promise<NoticeView> {
    return this.notices.create(user.sub, dto);
  }

  @Delete(':id')
  @Roles('admin', 'teacher')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notices.remove(id, user.sub, user.role);
  }
}
