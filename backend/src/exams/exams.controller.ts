import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateExamDto } from './dto/create-exam.dto.js';
import { SaveGradeScaleDto } from './dto/save-grade-scale.dto.js';
import { UpdateExamDto } from './dto/update-exam.dto.js';
import { SaveMarksDto } from './dto/save-marks.dto.js';
import { ListMarksQueryDto } from './dto/list-marks-query.dto.js';
import { ExamsService } from './exams.service.js';

const viewer = (user: JwtPayload) => ({ userId: user.sub, role: user.role });

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Post()
  @Roles('admin')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExamDto) {
    return this.exams.create(user.sub, dto);
  }

  @Get('sections')
  @Roles('admin', 'teacher')
  sections(@CurrentUser() user: JwtPayload) {
    return this.exams.listSections(viewer(user));
  }

  @Get()
  @Roles('admin', 'teacher')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.exams.findAll(viewer(user));
  }

  /** One class's roster and every entered mark, for the marks drawer and report cards. */
  @Get('marks')
  @Roles('admin', 'teacher')
  marks(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMarksQueryDto,
  ) {
    return this.exams.listMarks(viewer(user), query.sectionId);
  }

  /** The signed-in student's own marks only. */
  @Get('my-results')
  @Roles('student')
  myResults(@CurrentUser() user: JwtPayload) {
    return this.exams.myResults(user.sub);
  }

  /** Marks-to-grade scale, highest band first. */
  @Get('grade-scale')
  gradeScale() {
    return this.exams.getGradeScale();
  }

  @Put('grade-scale')
  @Roles('admin')
  saveGradeScale(@Body() dto: SaveGradeScaleDto) {
    return this.exams.saveGradeScale(dto.scale);
  }

  @Put(':id/marks')
  @Roles('teacher')
  saveMarks(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SaveMarksDto,
  ) {
    return this.exams.saveMarks(user.sub, id, dto.entries);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.exams.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.exams.remove(id);
  }
}
