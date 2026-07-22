import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { BizCustomer } from '../entities/BizCustomer';
import { BizVehicle } from '../entities/BizVehicle';
import { BizOrder } from '../entities/BizOrder';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';
import { BizPrivateRelation } from '../entities/BizPrivateRelation';
import { BizCustomerNote } from '../entities/BizCustomerNote';

@Module({
  imports: [TypeOrmModule.forFeature([
    BizCustomer, BizVehicle, BizOrder, BizFollowRecord, BizLead, BizPrivateRelation, BizCustomerNote
  ])],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
