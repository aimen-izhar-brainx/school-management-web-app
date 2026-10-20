import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import { TeachersService } from './teachers.service.js';

@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.teachers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teachers.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.teachers.remove(id);
  }
}
