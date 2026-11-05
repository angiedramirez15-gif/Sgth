import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

const ERRORES_CONEXION = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR']);

/** Convierte los errores en respuestas claras en español. */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }

    const codigo = (error as { code?: string }).code ?? '';
    if (ERRORES_CONEXION.has(codigo)) {
      this.logger.error(`Base de datos no disponible (${codigo})`);
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'No hay conexión con la base de datos. Verifique que MariaDB esté encendido.',
      });
      return;
    }

    if (codigo === 'ER_DUP_ENTRY') {
      res.status(HttpStatus.CONFLICT).json({ statusCode: HttpStatus.CONFLICT, message: 'Ya existe un registro con esos datos' });
      return;
    }

    this.logger.error((error as Error).stack ?? String(error));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ocurrió un error inesperado. Si continúa, informe al administrador del sistema.',
    });
  }
}
