import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { MailModule } from './mail/mail.module.js';
import { PeriodsModule } from './periods/periods.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SubjectsModule } from './subjects/subjects.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
    PrismaModule,
    UsersModule,
    MailModule,
    AuthModule,
    ClassesModule,
    SubjectsModule,
    PeriodsModule,
    TimetableModule,
    AttendanceModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
