import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ErroresFilter } from './common/errores.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas de la API empiezan por /api
  app.setGlobalPrefix('api');

  // Valida automáticamente los datos que llegan (DTO) y descarta campos no esperados
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // Respuestas de error en español y aviso claro si MariaDB no está disponible
  app.useGlobalFilters(new ErroresFilter());

  // En desarrollo Angular corre en el puerto 4200
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: ['http://localhost:4200'] });
  }

  const puerto = Number(process.env.PORT ?? 3000);
  await app.listen(puerto, '0.0.0.0'); // 0.0.0.0 = accesible desde otros PC de la red
  new Logger('SGTH').log(`Backend escuchando en http://localhost:${puerto}/api`);
}
await bootstrap();
