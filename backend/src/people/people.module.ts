import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  imports: [MailModule],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
