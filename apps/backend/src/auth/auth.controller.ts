import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 返回当前登录用户的实时权限（JwtAuthGuard 每次请求都从数据库重新计算），
  // 前端借此让角色权限调整后无需重新登录即可生效
  @Get('profile')
  getProfile(@Request() req: any) {
    return { permissions: req.user?.permissions || [] };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.login(signInDto.username, signInDto.password);
  }

  @Public()
  @Post('init-admin')
  initAdmin() {
    return this.authService.initAdmin();
  }
}
