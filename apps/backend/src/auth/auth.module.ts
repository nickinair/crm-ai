import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { SysAccount } from '../entities/SysAccount';
import { SysAccountRole } from '../entities/SysAccountRole';
import { SysRole } from '../entities/SysRole';
import { SysRolePermission } from '../entities/SysRolePermission';
import { SysPermission } from '../entities/SysPermission';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysAccount,
      SysAccountRole,
      SysRole,
      SysRolePermission,
      SysPermission,
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'crm-secret-key-2026',
      signOptions: { expiresIn: '1d' as any },
    }),
  ],
  providers: [AuthService, JwtAuthGuard, PermissionsGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtAuthGuard, PermissionsGuard, TypeOrmModule],
})
export class AuthModule {}
