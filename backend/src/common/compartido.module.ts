import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CorreoService } from '../correo/correo.service.js';

/** Servicios que usan todos los módulos. */
@Global()
@Module({
  providers: [AuditoriaService, ConfiguracionService, CorreoService],
  exports: [AuditoriaService, ConfiguracionService, CorreoService],
})
export class CompartidoModule {}
