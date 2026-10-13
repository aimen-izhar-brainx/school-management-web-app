import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module.js';
import { TimetableMeController } from './timetable-me.controller.js';
import { TimetableMeService } from './timetable-me.service.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';

@Module({
  imports: [PeriodsModule],
  controllers: [TimetableController, TimetableMeController],
  providers: [TimetableService, TimetableMeService],
})
export class TimetableModule {}
