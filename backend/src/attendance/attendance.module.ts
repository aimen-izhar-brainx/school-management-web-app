import { Module } from '@nestjs/common';
import { AttendanceAdminController, AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  controllers: [AttendanceController, AttendanceAdminController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
