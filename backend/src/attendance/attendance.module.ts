import { Module } from '@nestjs/common';
import {
  AttendanceAdminController,
  AttendanceController,
  AttendanceReportsController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  controllers: [AttendanceController, AttendanceAdminController, AttendanceReportsController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
