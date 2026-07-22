import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('permission')
@Controller('api')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get('permissions/tree')
  async getPermissionTree() {
    const data = await this.permissionService.getPermissionTree();
    return {
      code: 200,
      message: 'success',
      data,
    };
  }

  @Get('roles/:id/permissions')
  async getRolePermissions(@Param('id') roleId: string) {
    const data = await this.permissionService.getRolePermissions(roleId);
    return {
      code: 200,
      message: 'success',
      data,
    };
  }

  @Post('roles/:id/permissions')
  async updateRolePermissions(
    @Param('id') roleId: string,
    @Body('permissionIds') permissionIds: string[],
  ) {
    const data = await this.permissionService.updateRolePermissions(roleId, permissionIds);
    return {
      code: 200,
      message: 'success',
      data,
    };
  }
}
