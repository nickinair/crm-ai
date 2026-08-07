import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';
import { BizCustomer } from '../entities/BizCustomer';
import { BizLead } from '../entities/BizLead';
import { BizVehicle } from '../entities/BizVehicle';
import { BizProduct } from '../entities/BizProduct';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { SysAccount } from '../entities/SysAccount';
import { SysOperationLog } from '../entities/SysOperationLog';

@Module({
  imports: [TypeOrmModule.forFeature([BizOrder, BizOrderItem, BizCustomer, BizLead, BizVehicle, BizProduct, BizFollowRecord, SysAccount, SysOperationLog])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
