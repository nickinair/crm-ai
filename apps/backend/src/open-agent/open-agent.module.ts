import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BizCustomer } from '../entities/BizCustomer';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';
import { BizProduct } from '../entities/BizProduct';
import { BizVehicle } from '../entities/BizVehicle';
import { OpenAgentController } from './open-agent.controller';
import { OpenAgentService } from './open-agent.service';
import { ServiceTokenGuard } from './service-token.guard';

@Module({
  imports: [TypeOrmModule.forFeature([BizCustomer, BizVehicle, BizOrder, BizOrderItem, BizProduct])],
  controllers: [OpenAgentController],
  providers: [OpenAgentService, { provide: ServiceTokenGuard, useFactory: () => new ServiceTokenGuard(process.env) }],
})
export class OpenAgentModule {}
