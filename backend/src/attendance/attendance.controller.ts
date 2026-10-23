import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AttendanceService } from './attendance.service.js';
import {
  DateQueryDto,
  MonthQueryDto,
  SectionDayQueryDto,
} from './dto/attendance-query.dto.js';
import {
  SubmitAttendanceDto,
  UpdateRecordDto,
} from './dto/submit-attendance.dto.js';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post()
  @Roles('admin', 'teacher')
  submit(@CurrentUser() user: JwtPayload, @Body() dto: SubmitAttendanceDto) {
    return this.attendance.submit(user, dto);
  }

  @Get()
  @Roles('admin', 'teacher')
  findForSectionDay(
    @CurrentUser() user: JwtPayload,
    @Query() query: SectionDayQueryDto,
  ) {
    return this.attendance.findForSectionDay(user, query);
  }

  @Get('sections')
  @Roles('admin', 'teacher')
  sections(@CurrentUser() user: JwtPayload) {
    return this.attendance.listSections(user);
  }

  @Get('sections/:sectionId/students')
  @Roles('admin', 'teacher')
  roster(
    @CurrentUser() user: JwtPayload,
    @Param('sectionId') sectionId: string,
  ) {
    return this.attendance.rosterForSection(user, sectionId);
  }

  @Get('me')
  @Roles('student')
  findMine(@CurrentUser() user: JwtPayload, @Query() query: MonthQueryDto) {
    return this.attendance.findForMe(user, query.month);
  }

  @Get('summary')
  @Roles('admin')
  summary(@Query() query: DateQueryDto) {
    return this.attendance.summaryForDate(query.date);
  }

  @Get('sections/:sectionId/monthly')
  @Roles('admin')
  monthly(
    @Param('sectionId') sectionId: string,
    @Query() query: MonthQueryDto,
  ) {
    return this.attendance.monthlyForSection(sectionId, query.month);
  }

  @Get('students/:studentId')
  @Roles('admin', 'teacher', 'student')
  findForStudent(
    @CurrentUser() user: JwtPayload,
    @Param('studentId') studentId: string,
    @Query() query: MonthQueryDto,
  ) {
    return this.attendance.findForStudent(user, studentId, query.month);
  }

  @Patch('records/:recordId')
  @Roles('admin')
  correct(
    @CurrentUser() user: JwtPayload,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.attendance.correctRecord(user.sub, recordId, dto);
  }

  @Get('audit')
  @Roles('admin')
  auditForDay(@Query() query: SectionDayQueryDto) {
    return this.attendance.auditForSectionDay(query);
  }

  @Get('records/:recordId/audit')
  @Roles('admin')
  audit(@Param('recordId') recordId: string) {
    return this.attendance.auditTrail(recordId);
  }
}
