import { Module } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { CertificadosController } from '../certificados/certificados.controller.js';
import { CertificadosService } from '../certificados/certificados.service.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ActasController } from './actas.controller.js';
import { ActasService } from './actas.service.js';
import { EppController } from './epp.controller.js';
import { EppService } from './epp.service.js';
import { PdfActaService } from './pdf-acta.service.js';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasService } from './plantillas.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [ActasController, PlantillasController, EppController, CertificadosController],
  providers: [ActasService, EppService, PdfActaService, PlantillasService, ArchivosService, CertificadosService],
  exports: [ActasService],
})
export class ActasModule {}
