import { BadRequestException, ParseIntPipe } from '@nestjs/common';

/** Convierte el :id de la ruta a número, con mensaje en español si no lo es. */
export const IdPipe = new ParseIntPipe({ exceptionFactory: () => new BadRequestException('El identificador no es válido') });
