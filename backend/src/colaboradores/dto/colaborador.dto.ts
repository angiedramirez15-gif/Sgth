import { Transform, Type } from 'class-transformer';
import {
  IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { valores } from '../listas.js';

/** Texto: recorta espacios y convierte "" en null. */
const texto = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().replace(/\s+/g, ' ');
  return v === '' ? null : v;
};
/** Número: "" o null → null. */
const numero = ({ value }: { value: unknown }) => (value === '' || value === null || value === undefined ? null : Number(value));
const opcional = ValidateIf((_, v) => v !== null && v !== undefined);

export class ColaboradorDto {
  // --- Identificación ---
  @Type(() => Number) @IsInt({ message: 'Seleccione el tipo de documento' })
  tipoDocumentoId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.]/g, '').toUpperCase() : value))
  @IsString({ message: 'Escriba el número de documento' })
  @Matches(/^[A-Z0-9-]{3,20}$/, { message: 'El número de documento debe tener entre 3 y 20 caracteres: números, letras o guion (sin puntos)' })
  numeroDocumento: string;

  @Transform(texto) @IsString({ message: 'Escriba los nombres' }) @IsNotEmpty({ message: 'Escriba los nombres' })
  @MaxLength(100, { message: 'Los nombres no pueden superar 100 caracteres' })
  nombres: string;

  @Transform(texto) @IsString({ message: 'Escriba los apellidos' }) @IsNotEmpty({ message: 'Escriba los apellidos' })
  @MaxLength(100, { message: 'Los apellidos no pueden superar 100 caracteres' })
  apellidos: string;

  @IsIn(valores('sexo'), { message: 'Seleccione el sexo' })
  sexo: string;

  // --- Personales ---
  @Transform(texto) @IsOptional() @opcional @IsDateString({ strict: true }, { message: 'La fecha de nacimiento no es válida' })
  fechaNacimiento?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsIn(valores('tipoSangre'), { message: 'Tipo de sangre no válido' })
  tipoSangre?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsIn(valores('estadoCivil'), { message: 'Estado civil no válido' })
  estadoCivil?: string | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'El número de hijos debe ser un número entero' })
  @Min(0, { message: 'El número de hijos no puede ser negativo' }) @Max(30, { message: 'Revise el número de hijos' })
  numeroHijos?: number | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Las personas a cargo deben ser un número entero' })
  @Min(0, { message: 'Las personas a cargo no pueden ser negativas' }) @Max(30, { message: 'Revise las personas a cargo' })
  personasACargo?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsIn(valores('nivelEducativo'), { message: 'Nivel educativo no válido' })
  nivelEducativo?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(30, { message: 'El teléfono no puede superar 30 caracteres' })
  telefono?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsEmail({}, { message: 'El correo no es válido' }) @MaxLength(150)
  correo?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(200, { message: 'La dirección no puede superar 200 caracteres' })
  direccion?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'La ciudad no puede superar 80 caracteres' })
  ciudadResidencia?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(150, { message: 'El contacto de emergencia no puede superar 150 caracteres' })
  contactoEmergenciaNombre?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(30, { message: 'El teléfono de emergencia no puede superar 30 caracteres' })
  contactoEmergenciaTelefono?: string | null;

  // --- Laborales ---
  @Type(() => Number) @IsInt({ message: 'Seleccione el cargo' })
  cargoId: number;

  @Type(() => Number) @IsInt({ message: 'Seleccione el área' })
  areaId: number;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Jefe inmediato no válido' })
  jefeId?: number | null;

  @IsDateString({ strict: true }, { message: 'Escriba una fecha de ingreso válida' })
  fechaIngreso: string;

  @IsIn(valores('tipoContrato'), { message: 'Seleccione el tipo de contrato' })
  tipoContrato: string;

  @Transform(texto) @IsOptional() @opcional @IsDateString({ strict: true }, { message: 'La fecha de fin de contrato no es válida' })
  fechaFinContrato?: string | null;

  @Transform(numero) @IsOptional() @opcional @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El salario debe ser un número' })
  @Min(0, { message: 'El salario no puede ser negativo' }) @Max(9_999_999_999, { message: 'Revise el salario' })
  salario?: number | null;

  @Transform(({ value }) => value || 'AUTO') @IsIn(valores('derechoDotacion'), { message: 'Opción de dotación no válida' })
  derechoDotacion: string = 'AUTO';

  // --- Seguridad social ---
  @Transform(numero) @IsOptional() @opcional @IsInt() epsId?: number | null;
  @Transform(numero) @IsOptional() @opcional @IsInt() afpId?: number | null;
  @Transform(numero) @IsOptional() @opcional @IsInt() arlId?: number | null;
  @Transform(numero) @IsOptional() @opcional @IsInt() ccfId?: number | null;
  @Transform(numero) @IsOptional() @opcional @IsInt() cesantiasId?: number | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Seleccione un riesgo ARL de 1 a 5' })
  @Min(1, { message: 'Seleccione un riesgo ARL de 1 a 5' }) @Max(5, { message: 'Seleccione un riesgo ARL de 1 a 5' })
  nivelRiesgoArl?: number | null;

  // --- Bancarios (sensibles) ---
  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'El banco no puede superar 80 caracteres' })
  banco?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsIn(valores('tipoCuenta'), { message: 'Tipo de cuenta no válido' })
  tipoCuenta?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') || null : value))
  @IsOptional() @opcional @Matches(/^\d{4,30}$/, { message: 'El número de cuenta debe tener solo dígitos' })
  numeroCuenta?: string | null;

  // --- Tallas ---
  @IsOptional() @IsObject({ message: 'Tallas no válidas' })
  tallas?: Record<string, string | null>;
}

export class RetiroDto {
  @IsDateString({ strict: true }, { message: 'Escriba una fecha de retiro válida' })
  fechaRetiro: string;

  @Transform(texto) @IsString({ message: 'Escriba el motivo del retiro' }) @IsNotEmpty({ message: 'Escriba el motivo del retiro' })
  @MaxLength(255, { message: 'El motivo no puede superar 255 caracteres' })
  motivoRetiro: string;
}
