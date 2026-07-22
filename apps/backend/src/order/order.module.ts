import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';

@Module({
  imports: [TypeOrmModule.forFeature([BizOrder, BizOrderItem])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
