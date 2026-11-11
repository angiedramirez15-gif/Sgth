import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from './auth/auth.module.js';
import { CatalogosModule } from './catalogos/catalogos.module.js';
import { ColaboradoresModule } from './colaboradores/colaboradores.module.js';
import { ActasModule } from './actas/actas.module.js';
import { AlertasModule } from './alertas/alertas.module.js';
import { ReportesModule } from './reportes/reportes.module.js';
import { InventarioModule } from './inventario/inventario.module.js';
import { ConfiguracionController } from './configuracion/configuracion.controller.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { CompartidoModule } from './common/compartido.module.js';
import { DatabaseModule } from './database/database.module.js';
import { SaludController } from './salud/salud.controller.js';

// En producción, NestJS también entrega la versión compilada de Angular (sección 3.3).
const rutaFrontend = resolve(process.env.FRONTEND_DIST ?? '../frontend/dist/frontend/browser');
const servirFrontend = existsSync(rutaFrontend)
  ? [ServeStaticModule.forRoot({ rootPath: rutaFrontend, exclude: ['/api/{*ruta}'] })]
  : [];
if (!servirFrontend.length) {
  new Logger('AppModule').log(`Frontend compilado no encontrado en ${rutaFrontend}: solo se sirve la API`);
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CompartidoModule,
    AuthModule,
    UsuariosModule,
    CatalogosModule,
    ColaboradoresModule,
    InventarioModule,
    ActasModule,
    AlertasModule,
    ReportesModule,
    ...servirFrontend,
  ],
  controllers: [SaludController, ConfiguracionController],
})
export class AppModule {}
