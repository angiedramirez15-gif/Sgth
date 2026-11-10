import { Module } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ActasController } from './actas.controller.js';
import { ActasService } from './actas.service.js';
import { PdfActaService } from './pdf-acta.service.js';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasService } from './plantillas.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [ActasController, PlantillasController],
  providers: [ActasService, PdfActaService, PlantillasService, ArchivosService],
  exports: [ActasService],
})
export class ActasModule {}
