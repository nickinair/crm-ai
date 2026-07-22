import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';
import { BizLead } from '../entities/BizLead';
import { BizCustomer } from '../entities/BizCustomer';

@Module({
  imports: [TypeOrmModule.forFeature([BizLead, BizCustomer])],
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
