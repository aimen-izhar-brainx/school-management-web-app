import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { ClassSubjectsController } from './class-subjects.controller.js';
import { ClassSubjectsService } from './class-subjects.service.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';
import { SectionsController } from './sections.controller.js';
import { SectionsService } from './sections.service.js';

@Module({
  imports: [UsersModule],
  controllers: [ClassesController, SectionsController, ClassSubjectsController],
  providers: [ClassesService, SectionsService, ClassSubjectsService],
})
export class ClassesModule {}
