import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysPermission } from '../entities/SysPermission';
import { SysRolePermission } from '../entities/SysRolePermission';
import { SysRole } from '../entities/SysRole';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';

@Module({
  imports: [TypeOrmModule.forFeature([SysPermission, SysRolePermission, SysRole])],
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
