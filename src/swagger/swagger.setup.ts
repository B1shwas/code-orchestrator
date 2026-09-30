import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  const logger = new Logger('Swagger');
  const enabled = config.get<boolean>('swagger.enabled') ?? false;

  if (!enabled) {
    logger.log('Swagger disabled (SWAGGER_ENABLED=false)');
    return;
  }

  const path = config.get<string>('swagger.path') ?? 'docs';
  const title = config.get<string>('swagger.title') ?? 'WhyCODE API';
  const description =
    config.get<string>('swagger.description') ?? 'WhyCODE API documentation';
  const version = config.get<string>('swagger.version') ?? '1.0';

  const documentConfig = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}-json`,
    yamlDocumentUrl: `${path}-yaml`,
    customSiteTitle: `${title} — Docs`,
    swaggerOptions: { persistAuthorization: true },
  });

  logger.log(`Swagger docs available at /${path} and /${path}-json`);
}
