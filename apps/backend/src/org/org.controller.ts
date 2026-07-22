import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrgService } from './org.service';
import { SysOrganization } from '../entities/SysOrganization';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('organization')
@Controller('api/org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  create(@Body() createDto: Partial<SysOrganization>) {
    return this.orgService.create(createDto);
  }

  @Get()
  findAll() {
    return this.orgService.findAll();
  }

  @Get('check-delete/:id')
  checkDelete(@Param('id') id: string) {
    return this.orgService.checkDelete(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orgService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: Partial<SysOrganization>) {
    return this.orgService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orgService.remove(id);
  }
}
