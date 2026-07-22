import { Controller, Get, Post, Put, Body, Query, Param } from '@nestjs/common';
import { RoleService } from './role.service';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('permission')
@Controller('api/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  async createRole(@Body() body: { roleName: string; status: number; remark?: string }) {
    const result = await this.roleService.createRole(body);
    return {
      code: 200,
      message: 'success',
      data: result,
    };
  }

  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() body: { roleName?: string; status?: number; remark?: string }) {
    const result = await this.roleService.updateRole(id, body);
    return {
      code: 200,
      message: 'success',
      data: result,
    };
  }

  @Get()
  async getRoles(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
    @Query('roleName') roleName?: string,
  ) {
    const result = await this.roleService.getRoles(Number(page), Number(pageSize), roleName);
    return {
      code: 200,
      message: 'success',
      data: result,
    };
  }
}
