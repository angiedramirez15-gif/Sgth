import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'El usuario debe ser texto' })
  @IsNotEmpty({ message: 'Escriba el usuario' })
  @MaxLength(40, { message: 'El usuario no puede superar 40 caracteres' })
  usuario: string;

  @IsString({ message: 'La clave debe ser texto' })
  @IsNotEmpty({ message: 'Escriba la clave' })
  @MaxLength(100, { message: 'La clave no puede superar 100 caracteres' })
  clave: string;
}

export class CambiarClaveDto {
  @IsString({ message: 'La clave actual debe ser texto' })
  @IsNotEmpty({ message: 'Escriba la clave actual' })
  @MaxLength(100, { message: 'La clave no puede superar 100 caracteres' })
  claveActual: string;

  // Las reglas (longitud, letras y números, comunes, historial) se revisan en el servicio
  @IsString({ message: 'La clave nueva debe ser texto' })
  @IsNotEmpty({ message: 'Escriba la clave nueva' })
  @MaxLength(100, { message: 'La clave nueva no puede superar 72 caracteres' })
  claveNueva: string;
}

export class CodigoDto {
  @IsString({ message: 'Escriba el código' })
  @IsNotEmpty({ message: 'Escriba el código' })
  @MaxLength(20, { message: 'El código no es válido' })
  codigo: string;
}

export class AceptarCompromisoDto {
  @IsInt({ message: 'Compromiso no válido' })
  @Min(1, { message: 'Compromiso no válido' })
  textoId: number;
}

export class ConfirmarClaveDto {
  @IsString({ message: 'Escriba su clave' })
  @IsNotEmpty({ message: 'Escriba su clave' })
  @MaxLength(100, { message: 'La clave no puede superar 100 caracteres' })
  clave: string;
}
