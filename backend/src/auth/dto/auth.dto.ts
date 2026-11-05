import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
  claveActual: string;

  @IsString({ message: 'La clave nueva debe ser texto' })
  @MinLength(8, { message: 'La clave nueva debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La clave nueva no puede superar 72 caracteres' })
  @Matches(/(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d)/, {
    message: 'La clave nueva debe tener al menos una letra y un número',
  })
  claveNueva: string;
}
