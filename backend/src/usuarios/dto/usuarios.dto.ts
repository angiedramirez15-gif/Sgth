import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export const ROLES = ['ADMIN', 'TH', 'SST', 'CONSULTA'] as const;
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class DatosUsuarioDto {
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'Escriba el nombre completo' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombreCompleto: string;

  @Transform(recortar)
  @IsString({ message: 'El cargo debe ser texto' })
  @IsNotEmpty({ message: 'Escriba el cargo; aparece en la firma ENTREGA de las actas' })
  @MaxLength(100, { message: 'El cargo no puede superar 100 caracteres' })
  cargo: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : recortar({ value })))
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  correo?: string | null;

  @IsIn(ROLES, { message: 'Seleccione un rol válido' })
  rol: (typeof ROLES)[number];
}

export class CrearUsuarioDto extends DatosUsuarioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString({ message: 'El usuario debe ser texto' })
  @Matches(/^[a-z0-9._-]{3,40}$/, {
    message: 'El usuario debe tener entre 3 y 40 caracteres: letras minúsculas sin tildes, números, punto, guion o guion bajo',
  })
  usuario: string;
}

export class EditarUsuarioDto extends DatosUsuarioDto {}

export class CambiarEstadoDto {
  @IsBoolean({ message: 'Indique si el registro queda activo' })
  activo: boolean;
}
