import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { AccountService } from './account.service';
import { SysAccount } from '../entities/SysAccount';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('organization')
@Controller('api/account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  create(@Body() createDto: Partial<SysAccount> & { orgIds?: string[], roleIds?: string[] }) {
    return this.accountService.create(createDto);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.accountService.findAll(query);
  }

  @RequirePermissions('organization', 'customer', 'lead', 'workbench')
  @Get('sales-list')
  getSalesList() {
    return this.accountService.getSalesList();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountService.findOne(id);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: any) {
    return this.accountService.resetPassword(id, body.password);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: Partial<SysAccount>) {
    return this.accountService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountService.remove(id);
  }
}
