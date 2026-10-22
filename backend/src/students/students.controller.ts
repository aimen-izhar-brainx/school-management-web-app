import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.students.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.students.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.students.remove(id);
  }
}
