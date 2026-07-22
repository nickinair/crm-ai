import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgService } from './org.service';
import { OrgController } from './org.controller';
import { SysOrganization } from '../entities/SysOrganization';
import { SysAccount } from '../entities/SysAccount';
import { SysAccountOrg } from '../entities/SysAccountOrg';

@Module({
  imports: [TypeOrmModule.forFeature([SysOrganization, SysAccount, SysAccountOrg])],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
