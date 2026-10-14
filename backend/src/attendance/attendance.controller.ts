import { Body, Controller, Get, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
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
