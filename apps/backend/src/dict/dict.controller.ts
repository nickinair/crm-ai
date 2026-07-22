import { Controller, Get, Param } from '@nestjs/common';
import { DictService } from './dict.service';

@Controller('api/dict')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  @Get('all')
  findAllGrouped() {
    return this.dictService.findAllGrouped();
  }

  @Get('type/:typeCode')
  findItemsByType(@Param('typeCode') typeCode: string) {
    return this.dictService.findItemsByType(typeCode);
  }
}
