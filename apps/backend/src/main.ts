// MUST be the absolute first executed line - load env vars and set timezone before ANY module loads
require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Shanghai';

async function bootstrap() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('./app.module');
  const helmet = require('helmet');

  const app = await NestFactory.create(AppModule);

  // Security: HTTP response headers
  app.use(helmet());

  // Increase payload size limit to support large file uploads (25MB+ limit)
  // Nest 自带的 useBodyParser 由 @nestjs/platform-express 提供，无需直接依赖 body-parser
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  // Security: CORS whitelist — only allow our frontend domains
  app.enableCors({
    origin: [
      'http://124.222.117.150:8109',
      'http://crm.emergix.cn',
      'https://crm.emergix.cn',
      'http://crm.easy-charge.cn',
      'https://crm.easy-charge.cn',
      'http://localhost:5173',  // dev
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 CRM Backend running on port ${process.env.PORT ?? 3000} with security enabled`);
}
bootstrap();
