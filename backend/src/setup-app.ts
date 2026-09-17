import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.schema.js';

/** Configuración HTTP compartida entre `main.ts` y las pruebas e2e. */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const express = app as NestExpressApplication;

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());

  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '100kb' });
  if (config.get('TRUST_PROXY', { infer: true })) express.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // requerido por Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://images.openfoodfacts.org'],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Response-Time-Ms'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SmartCommerce API')
        .setDescription(
          'API REST principal. Autenticación con JWT (Bearer) y refresh token rotativo. ' +
            'Todas las respuestas de error siguen el formato {statusCode, code, message, details, path, timestamp, requestId}.',
        )
        .setVersion(config.get('APP_VERSION', { infer: true }))
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }
}
