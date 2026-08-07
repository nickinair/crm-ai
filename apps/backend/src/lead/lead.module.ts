import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';
import { BizLead } from '../entities/BizLead';
import { BizCustomer } from '../entities/BizCustomer';
import { BizLeadLock } from '../entities/BizLeadLock';

@Module({
  imports: [TypeOrmModule.forFeature([BizLead, BizCustomer, BizLeadLock])],
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
