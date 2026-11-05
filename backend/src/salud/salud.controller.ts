import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Publico } from '../common/decorators/decoradores.js';

@Controller('salud')
export class SaludController {
  constructor(private readonly db: DatabaseService) {}

  /** GET /api/salud — para comprobar que el backend y MariaDB están funcionando */
  @Publico()
  @Get()
  async estado() {
    return {
      sistema: 'SGTH',
      backend: 'ok',
      baseDatos: (await this.db.disponible()) ? 'ok' : 'sin conexión',
      hora: new Date().toISOString(),
    };
  }
}
