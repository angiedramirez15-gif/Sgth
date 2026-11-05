import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

/** Servicios que usan todos los módulos. */
@Global()
@Module({
  providers: [AuditoriaService, ConfiguracionService],
  exports: [AuditoriaService, ConfiguracionService],
})
export class CompartidoModule {}
