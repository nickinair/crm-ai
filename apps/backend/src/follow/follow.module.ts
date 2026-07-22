import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowService } from './follow.service';
import { FollowController } from './follow.controller';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';

@Module({
  imports: [TypeOrmModule.forFeature([BizFollowRecord, BizLead])],
  controllers: [FollowController],
  providers: [FollowService],
})
export class FollowModule {}
