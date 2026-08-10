import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { DictService } from './dict.service';
import { RequirePermissions } from '../auth/permissions.decorator';

@Controller('api/dict')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  @Get('all')
  findAllGrouped() {
    return this.dictService.findAllGrouped();
  }

  /** parentValue 用于联动字典，如 /api/dict/type/product_attribute?parentValue=整车延保 */
  @Get('type/:typeCode')
  findItemsByType(@Param('typeCode') typeCode: string, @Query('parentValue') parentValue?: string) {
    return this.dictService.findItemsByType(typeCode, parentValue);
  }

  // ============================================================
  // 配置管理（数据字典维护）：仅系统配置权限可用
  // ============================================================

  @RequirePermissions('config')
  @Get('admin/types')
  listTypes(@Query('keyword') keyword?: string) {
    return this.dictService.listTypesForAdmin(keyword);
  }

  @RequirePermissions('config')
  @Get('admin/items/:typeId')
  listItems(@Param('typeId') typeId: string) {
    return this.dictService.listItemsForAdmin(typeId);
  }

  @RequirePermissions('config')
  @Post('admin/items')
  createItem(@Body() body: any) {
    return this.dictService.createItem(body);
  }

  @RequirePermissions('config')
  @Put('admin/items/:id')
  updateItem(@Param('id') id: string, @Body() body: any) {
    return this.dictService.updateItem(id, body);
  }

  @RequirePermissions('config')
  @Delete('admin/items/:id')
  deleteItem(@Param('id') id: string) {
    return this.dictService.deleteItem(id);
  }
}
