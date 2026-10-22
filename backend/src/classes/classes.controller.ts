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
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ClassesService } from './classes.service.js';
import {
  CreateClassDto,
  CreateSectionInput,
  CreateSubjectAssignmentInput,
  UpdateSectionDto,
} from './dto/create-class.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  findAll() {
    return this.classes.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.classes.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateClassDto) {
    return this.classes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.classes.remove(id);
  }

  @Post(':id/sections')
  addSection(@Param('id') id: string, @Body() dto: CreateSectionInput) {
    return this.classes.addSection(id, dto);
  }

  @Patch('sections/:sectionId')
  updateSection(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.classes.updateSection(sectionId, dto);
  }

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSection(@Param('sectionId') sectionId: string) {
    return this.classes.removeSection(sectionId);
  }

  @Put(':id/subjects')
  upsertSubject(
    @Param('id') id: string,
    @Body() dto: CreateSubjectAssignmentInput,
  ) {
    return this.classes.upsertSubject(id, dto);
  }

  @Delete(':id/subjects/:subject')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSubject(@Param('id') id: string, @Param('subject') subject: string) {
    return this.classes.removeSubject(id, subject);
  }
}
