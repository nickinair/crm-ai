import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DictService } from './dict.service';
import { DictController } from './dict.controller';
import { SysDictType } from '../entities/SysDictType';
import { SysDictItem } from '../entities/SysDictItem';

@Module({
  imports: [TypeOrmModule.forFeature([SysDictType, SysDictItem])],
  controllers: [DictController],
  providers: [DictService],
})
export class DictModule {}
