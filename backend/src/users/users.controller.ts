import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AssignSectionDto } from './dto/assign-section.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  list(@Query() query: ListUsersDto) {
    return this.users.listByRole(query.role);
  }

  @Patch(':id/section')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  setSection(@Param('id') id: string, @Body() dto: AssignSectionDto) {
    return this.users.setSection(id, dto.sectionId);
  }
}
