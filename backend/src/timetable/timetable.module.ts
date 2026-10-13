import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';

@Module({
  imports: [PeriodsModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
