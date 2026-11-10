import { Module } from '@nestjs/common';
import { ActivosService } from './activos.service.js';
import { ElementosService } from './elementos.service.js';
import { InventarioController } from './inventario.controller.js';
import { StickersService } from './stickers.service.js';

@Module({
  controllers: [InventarioController],
  providers: [ElementosService, ActivosService, StickersService],
  exports: [ElementosService, ActivosService],
})
export class InventarioModule {}
