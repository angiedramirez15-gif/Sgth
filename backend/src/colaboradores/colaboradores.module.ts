import { Module } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { ColaboradoresController } from './colaboradores.controller.js';
import { ColaboradoresService } from './colaboradores.service.js';
import { DocumentosService } from './documentos.service.js';
import { ImportacionService } from './importacion.service.js';

@Module({
  controllers: [ColaboradoresController],
  providers: [ColaboradoresService, DocumentosService, ImportacionService, ArchivosService],
  exports: [ColaboradoresService, ArchivosService],
})
export class ColaboradoresModule {}
