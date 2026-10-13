import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ClassTeacherDto } from './dto/class-teacher.dto.js';
import { SectionNameDto } from './dto/section-name.dto.js';
import { SectionsService } from './sections.service.js';

@Controller('classes/:classId/sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Post()
  create(@Param('classId') classId: string, @Body() dto: SectionNameDto) {
    return this.sections.create(classId, dto.name);
  }

  @Patch(':id')
  rename(@Param('classId') classId: string, @Param('id') id: string, @Body() dto: SectionNameDto) {
    return this.sections.rename(classId, id, dto.name);
  }

  @Patch(':id/class-teacher')
  setClassTeacher(
    @Param('classId') classId: string,
    @Param('id') id: string,
    @Body() dto: ClassTeacherDto,
  ) {
    return this.sections.setClassTeacher(classId, id, dto.teacherId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('classId') classId: string, @Param('id') id: string) {
    return this.sections.remove(classId, id);
  }
}
