import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';

@Module({
  imports: [MailModule],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
