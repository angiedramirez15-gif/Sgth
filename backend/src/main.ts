import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ErroresFilter } from './common/errores.filter.js';

const log = new Logger('SGTH');

/**
 * HTTPS (candado): se activa con el certificado indicado en .env.
 *   HTTPS_PFX=C:\SGTH\certificado\sgth.pfx   y   HTTPS_PFX_CLAVE=...
 *   o bien HTTPS_CERT=...crt  y  HTTPS_KEY=...key
 * Sin estas variables el sistema corre con http (solo para desarrollo).
 */
function opcionesHttps() {
  const { HTTPS_PFX, HTTPS_PFX_CLAVE, HTTPS_CERT, HTTPS_KEY } = process.env;
  if (HTTPS_PFX) return { pfx: readFileSync(HTTPS_PFX), passphrase: HTTPS_PFX_CLAVE };
  if (HTTPS_CERT && HTTPS_KEY) return { cert: readFileSync(HTTPS_CERT), key: readFileSync(HTTPS_KEY) };
  return undefined;
}

async function bootstrap() {
  const httpsOptions = opcionesHttps();
  const conHttps = !!httpsOptions;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { httpsOptions });

  // Cabeceras de seguridad: el navegador solo ejecuta el código del propio SGTH,
  // no deja que otra página lo muestre dentro de un marco y no envía datos a otros sitios.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"], // Angular Material agrega estilos en línea
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-src': ["'self'", 'blob:'], // vista previa de PDF
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'base-uri': ["'self'"],
          'upgrade-insecure-requests': conHttps ? [] : null,
        },
      },
      strictTransportSecurity: conHttps ? { maxAge: 180 * 24 * 3600 } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // Las respuestas de la API no se guardan en la caché del navegador (datos personales)
  app.use('/api', (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
  app.disable('x-powered-by');

  // Todas las rutas de la API empiezan por /api
  app.setGlobalPrefix('api');

  // Valida automáticamente los datos que llegan (DTO) y descarta campos no esperados
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // Respuestas de error en español y aviso claro si MariaDB no está disponible
  app.useGlobalFilters(new ErroresFilter());

  // En desarrollo Angular corre en el puerto 4200 (con proxy, así que no hace falta CORS)

  const puerto = Number(process.env.PORT ?? 3000);
  await app.listen(puerto, '0.0.0.0'); // 0.0.0.0 = accesible desde otros PC de la red
  log.log(`Backend escuchando en ${conHttps ? 'https' : 'http'}://localhost:${puerto}/api`);

  // Opcional: quien entre por http://servidor (puerto 80) pasa a https
  const redireccion = Number(process.env.HTTP_REDIRECCION_PUERTO ?? 0);
  if (conHttps && redireccion) {
    createServer((req, res) => {
      const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
      res.writeHead(301, { Location: `https://${host}${puerto === 443 ? '' : `:${puerto}`}${req.url ?? '/'}` });
      res.end();
    }).listen(redireccion, '0.0.0.0', () => log.log(`Redirección de http (puerto ${redireccion}) a https activa`));
  }
  if (!conHttps && process.env.NODE_ENV === 'production') {
    log.warn('El sistema corre SIN HTTPS. Configure HTTPS_PFX en .env antes de usarlo en la red (Fase 7).');
  }
}
await bootstrap();
