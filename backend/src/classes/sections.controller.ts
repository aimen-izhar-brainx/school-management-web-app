import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ClassTeacherDto } from './dto/class-teacher.dto.js';
import { SectionNameDto } from './dto/section-name.dto.js';
import { SectionsService } from './sections.service.js';

@Controller('sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AllSectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  list() {
    return this.sections.listAll();
  }
}

@Controller('classes/:classId/sections')
@UseGuards(JwtAuthGuard)
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  list(@Param('classId') classId: string) {
    return this.sections.list(classId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Param('classId') classId: string, @Body() dto: SectionNameDto) {
    return this.sections.create(classId, dto.name);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  rename(@Param('classId') classId: string, @Param('id') id: string, @Body() dto: SectionNameDto) {
    return this.sections.rename(classId, id, dto.name);
  }

  @Patch(':id/class-teacher')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setClassTeacher(
    @Param('classId') classId: string,
    @Param('id') id: string,
    @Body() dto: ClassTeacherDto,
  ) {
    return this.sections.setClassTeacher(classId, id, dto.teacherId);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('classId') classId: string, @Param('id') id: string) {
    return this.sections.remove(classId, id);
  }
}
