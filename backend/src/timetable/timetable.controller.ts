import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PlaceEntryDto } from './dto/place-entry.dto.js';
import { DayOfWeek } from '../generated/prisma/enums.js';
import { TimetableService } from './timetable.service.js';

@Controller('sections/:sectionId/timetable')
@UseGuards(JwtAuthGuard)
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get()
  getGrid(@Param('sectionId') sectionId: string) {
    return this.timetable.getGrid(sectionId);
  }

  @Put(':periodId/:dayOfWeek')
  @UseGuards(RolesGuard)
  @Roles('admin')
  place(
    @Param('sectionId') sectionId: string,
    @Param('periodId') periodId: string,
    @Param('dayOfWeek', new ParseEnumPipe(DayOfWeek)) dayOfWeek: DayOfWeek,
    @Body() dto: PlaceEntryDto,
  ) {
    return this.timetable.place(sectionId, periodId, dayOfWeek, dto.subjectId);
  }

  @Delete(':periodId/:dayOfWeek')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('admin')
  clear(
    @Param('sectionId') sectionId: string,
    @Param('periodId') periodId: string,
    @Param('dayOfWeek', new ParseEnumPipe(DayOfWeek)) dayOfWeek: DayOfWeek,
  ) {
    return this.timetable.clear(sectionId, periodId, dayOfWeek);
  }
}
