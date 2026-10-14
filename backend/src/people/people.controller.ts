import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreatePersonDto } from './dto/create-person.dto.js';
import { ListPeopleDto } from './dto/list-people.dto.js';
import { UpdatePersonDto } from './dto/update-person.dto.js';
import { PeopleService } from './people.service.js';

@Controller('people')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  list(@Query() query: ListPeopleDto) {
    return this.people.list(query.role);
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.people.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.people.update(id, dto);
  }

  @Post(':id/invite')
  @HttpCode(204)
  resendInvite(@Param('id') id: string) {
    return this.people.resendInvite(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.people.remove(id);
  }
}
