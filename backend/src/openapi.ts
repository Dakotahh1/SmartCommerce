/**
 * Exporta el documento OpenAPI de la API a `docs/api/backend.openapi.json` sin base de datos ni
 * servicio Python: Nest arma el grafo de módulos en modo *preview* (no instancia proveedores ni abre
 * conexiones) y Swagger lee los metadatos de los controladores.
 *
 * Usa el código compilado porque el plugin de Swagger (nest-cli.json) agrega los esquemas de los DTO
 * durante `nest build`. Con `--check` no escribe: falla si el archivo versionado quedó desactualizado.
 *
 * Uso (desde backend/):  npm run build && npm run openapi [-- --check]
 */
import 'reflect-metadata';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '..', 'docs', 'api', 'backend.openapi.json');

// La configuración se valida al importar AppModule: valores de relleno que nunca se usan.
const placeholders: Record<string, string> = {
  DB_HOST: 'localhost',
  DB_NAME: 'smartcommerce',
  DB_USER: 'smartcommerce',
  DB_PASSWORD: 'x'.repeat(32),
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  INTERNAL_API_TOKEN: 'x'.repeat(32),
  PYTHON_SERVICE_URL: 'http://localhost:8000',
  LOG_LEVEL: 'silent',
};
for (const [key, value] of Object.entries(placeholders)) {
  process.env[key] ??= value;
}

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('./app.module.js');
const { configureRouting, createOpenApiDocument } =
  await import('./setup-app.js');

const { version } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as { version: string };
const app = await NestFactory.create(AppModule, {
  preview: true,
  logger: false,
});
configureRouting(app);
const content = `${JSON.stringify(createOpenApiDocument(app, version), null, 2)}\n`;
const target = relative(resolve(root, '..'), output);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(output, 'utf8');
  } catch {
    // Sin archivo previo: se informa como desactualizado.
  }
  if (current !== content) {
    process.stderr.write(
      `${target} no coincide con la API. Regenerar con: npm run build && npm run openapi\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${target} al día\n`);
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
  process.stdout.write(`OpenAPI escrito en ${target}\n`);
}
// En modo preview no hay recursos que cerrar con app.close().
process.exit(0);
