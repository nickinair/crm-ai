import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CustomerService } from './src/customer/customer.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(CustomerService);
  const res = await service.getCustomer360View('74');
  console.log('--- RESULT ---');
  console.log(res);
  await app.close();
}
bootstrap();
