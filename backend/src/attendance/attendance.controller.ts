import { Body, Controller, Get, Param, Patch, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AttendanceService } from './attendance.service.js';
import { SubmitAttendanceDto } from './dto/submit-attendance.dto.js';

@Controller('attendance/sections/:sectionId/days')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Put(':date')
  @Roles('teacher')
  submit(
    @Param('sectionId') sectionId: string,
    @Param('date') date: string,
    @Body() dto: SubmitAttendanceDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.attendance.submit(sectionId, date, dto.entries, req.user.sub);
  }

  @Get(':date')
  @Roles('teacher')
  get(
    @Param('sectionId') sectionId: string,
    @Param('date') date: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.attendance.get(sectionId, date, req.user.sub);
  }
}

// T-038: a logged-in student's own monthly attendance (UC-10, UC-11). Deliberately its own
// `@Controller('attendance')` + `@Get('me')` (rather than a param on the teacher/admin controllers
// above) so the route takes no student/section id parameter at all — `req.user.sub` is the only
// source of identity, so there is nothing for a client to override to target another student.
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceMeController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('me')
  @Roles('student')
  getMine(@Query('month') month: string, @Req() req: Request & { user: JwtPayload }) {
    return this.attendance.getMine(req.user.sub, month);
  }
}

// T-034: kept as a separate `/attendance/admin/...` route (rather than overloading the M1
// teacher route above) so `@Roles('admin')` vs `@Roles('teacher')` guards stay simple and
// AC-07.1/AC-07.2 are trivial route-level checks — no ownership check is performed here at all.
@Controller('attendance/admin/sections/:sectionId/days')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AttendanceAdminController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':date')
  get(@Param('sectionId') sectionId: string, @Param('date') date: string) {
    return this.attendance.getAsAdmin(sectionId, date);
  }

  @Patch(':date')
  edit(
    @Param('sectionId') sectionId: string,
    @Param('date') date: string,
    @Body() dto: SubmitAttendanceDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.attendance.editAsAdmin(sectionId, date, dto.entries, req.user.sub);
  }
}

// T-036: admin-only reporting endpoints — a dedicated `/attendance/reports/...` path (rather than
// nesting under `/attendance/admin/sections/:sectionId/days` above) since these summarize across
// sections (daily) or a whole month (monthly), not a single section+day.
@Controller('attendance/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AttendanceReportsController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('daily')
  daily(@Query('date') date: string) {
    return this.attendance.dailyReport(date);
  }

  @Get('monthly')
  monthly(@Query('sectionId') sectionId: string, @Query('month') month: string) {
    return this.attendance.monthlyReport(sectionId, month);
  }
}
