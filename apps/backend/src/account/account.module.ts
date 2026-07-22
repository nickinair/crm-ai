import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { SysAccount } from '../entities/SysAccount';
import { SysAccountOrg } from '../entities/SysAccountOrg';
import { SysAccountRole } from '../entities/SysAccountRole';
import { SysOrganization } from '../entities/SysOrganization';

@Module({
  imports: [TypeOrmModule.forFeature([SysAccount, SysAccountOrg, SysAccountRole, SysOrganization])],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
