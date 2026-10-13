import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';
import { SectionsController } from './sections.controller.js';
import { SectionsService } from './sections.service.js';

@Module({
  controllers: [ClassesController, SectionsController],
  providers: [ClassesService, SectionsService],
})
export class ClassesModule {}
