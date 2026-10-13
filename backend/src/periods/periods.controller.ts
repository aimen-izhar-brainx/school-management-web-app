import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PeriodsService } from './periods.service.js';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.periods.list();
  }
}
