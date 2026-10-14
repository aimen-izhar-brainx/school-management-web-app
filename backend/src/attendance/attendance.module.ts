import { Module } from '@nestjs/common';
import {
  AttendanceAdminController,
  AttendanceController,
  AttendanceMeController,
  AttendanceReportsController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  controllers: [
    AttendanceController,
    AttendanceAdminController,
    AttendanceReportsController,
    AttendanceMeController,
  ],
  providers: [AttendanceService],
})
export class AttendanceModule {}
