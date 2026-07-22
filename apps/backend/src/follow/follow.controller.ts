import { Controller, Post, Body } from '@nestjs/common';
import { FollowService } from './follow.service';
import { BizFollowRecord } from '../entities/BizFollowRecord';

@Controller('api/follow')
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Post()
  addFollowRecord(@Body() data: any) {
    return this.followService.addFollowRecord(data);
  }
}
