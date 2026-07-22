import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { OrgModule } from './org/org.module';
import { AccountModule } from './account/account.module';
import { DictModule } from './dict/dict.module';
import { LeadModule } from './lead/lead.module';
import { CustomerModule } from './customer/customer.module';
import { FollowModule } from './follow/follow.module';
import { ProductModule } from './product/product.module';
import { OrderModule } from './order/order.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';

import { PermissionsGuard } from './auth/permissions.guard';

@Module({
  imports: [
    // Rate limiting: default 100 requests per 60 seconds
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'gz-cynosdbmysql-grp-gg6zs39t.sql.tencentcdb.com',
      port: parseInt(process.env.DB_PORT || '20953', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'crm_sales',
      entities: [__dirname + '/entities/*.{ts,js}'],
      synchronize: false,
      timezone: '+08:00',
    }),
    AuthModule,
    OrgModule,
    AccountModule,
    DictModule,
    LeadModule,
    CustomerModule,
    FollowModule,
    ProductModule,
    OrderModule,
    RoleModule,
    PermissionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT Auth Guard — all routes require authentication unless marked @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Permissions Guard — checks @RequirePermissions() on routes
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // Global Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
