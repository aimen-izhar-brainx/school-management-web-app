import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ClassSubjectsService } from './class-subjects.service.js';
import { AddClassSubjectDto } from './dto/class-subject.dto.js';
import { ClassTeacherDto } from './dto/class-teacher.dto.js';

@Controller('classes/:classId/subjects')
export class ClassSubjectsController {
  constructor(private readonly classSubjects: ClassSubjectsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Param('classId') classId: string) {
    return this.classSubjects.list(classId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  add(@Param('classId') classId: string, @Body() dto: AddClassSubjectDto) {
    return this.classSubjects.add(classId, dto.subjectId);
  }

  @Patch(':id/teacher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  setTeacher(
    @Param('classId') classId: string,
    @Param('id') id: string,
    @Body() dto: ClassTeacherDto,
  ) {
    return this.classSubjects.setTeacher(classId, id, dto.teacherId);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('classId') classId: string, @Param('id') id: string) {
    return this.classSubjects.remove(classId, id);
  }
}
