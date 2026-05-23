import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import helmet from 'helmet';
import compression from 'compression';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module';

function configureCors(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const origins =
    process.env.CORS_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: true,
    });
    return;
  }

  if (nodeEnv !== 'production') {
    app.enableCors();
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.use(helmet());
  app.use(compression());

  configureCors(app);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Wallet Ledger Service')
    .setDescription('Financial wallet service')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
