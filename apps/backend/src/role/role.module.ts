import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysRole } from '../entities/SysRole';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SysRole])],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
