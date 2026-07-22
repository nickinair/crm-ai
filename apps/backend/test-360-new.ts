import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CustomerService } from './src/customer/customer.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(CustomerService);
  try {
    const res = await service.getCustomer360View('96');
    console.log('--- RESULT ---');
    console.log(res);
  } catch (e) {
    console.error('ERROR:', e);
  }
  await app.close();
}
bootstrap();
