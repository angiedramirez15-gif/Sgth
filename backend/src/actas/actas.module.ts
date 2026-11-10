import { Module } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ActasController } from './actas.controller.js';
import { ActasService } from './actas.service.js';
import { PdfActaService } from './pdf-acta.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [ActasController],
  providers: [ActasService, PdfActaService, ArchivosService],
  exports: [ActasService],
})
export class ActasModule {}
