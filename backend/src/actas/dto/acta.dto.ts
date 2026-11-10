import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { CONDICIONES } from '../../inventario/dto/inventario.dto.js';
import { MOTIVOS } from '../textos.js';

const texto = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().replace(/\s+/g, ' ');
  return v === '' ? null : v;
};
const numero = ({ value }: { value: unknown }) => (value === '' || value === null || value === undefined ? null : Number(value));
const opcional = ValidateIf((_, v) => v !== null && v !== undefined);
const MOTIVOS_VALIDOS = Object.keys(MOTIVOS);

/** Una línea: un activo con placa, o un elemento por cantidad con su talla. */
export class LineaEntregaDto {
  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Activo no válido' })
  activoId?: number | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Elemento no válido' })
  elementoId?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(10)
  talla?: string | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' }) @Max(1000, { message: 'Revise la cantidad' })
  cantidad?: number | null;
}

export class EntregaDto {
  @IsIn(['DOTACION', 'EQUIPOS', 'MUEBLES', 'OTROS'], { message: 'Seleccione qué se entrega' })
  plantilla: 'DOTACION' | 'EQUIPOS' | 'MUEBLES' | 'OTROS';

  @Type(() => Number) @IsInt({ message: 'Seleccione el colaborador' })
  colaboradorId: number;

  @IsDateString({ strict: true }, { message: 'La fecha de entrega no es válida' })
  fecha: string;

  @IsIn(MOTIVOS_VALIDOS, { message: 'Seleccione el motivo' })
  motivo: string;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Período no válido' })
  periodoDotacionId?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(150, { message: 'La ubicación no puede superar 150 caracteres' })
  ubicacion?: string | null;

  /** Traspaso: colaborador que tenía los activos. */
  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Colaborador anterior no válido' })
  colaboradorAnteriorId?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(500, { message: 'Las observaciones no pueden superar 500 caracteres' })
  observaciones?: string | null;

  @IsArray({ message: 'Agregue al menos un elemento' })
  @ArrayMinSize(1, { message: 'Agregue al menos un elemento' }) @ArrayMaxSize(100, { message: 'Máximo 100 elementos por acta' })
  @ValidateNested({ each: true }) @Type(() => LineaEntregaDto)
  lineas: LineaEntregaDto[];
}

export class LineaDevolucionDto extends LineaEntregaDto {
  @IsIn(CONDICIONES, { message: 'Indique el estado en que se recibe' })
  condicion: string;

  /** Activos: en qué estado queda después de recibirlo. */
  @IsOptional() @IsIn(['DISPONIBLE', 'EN_REPARACION', 'DADO_DE_BAJA'], { message: 'Indique cómo queda el activo' })
  quedaEn?: 'DISPONIBLE' | 'EN_REPARACION' | 'DADO_DE_BAJA';

  /** Elementos por cantidad: vuelve al stock (si está en buen estado). */
  @IsOptional() @IsBoolean()
  reingresa?: boolean;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'La observación no puede superar 255 caracteres' })
  observaciones?: string | null;
}

export class DevolucionDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione el colaborador' })
  colaboradorId: number;

  @IsDateString({ strict: true }, { message: 'La fecha de devolución no es válida' })
  fecha: string;

  @IsIn(MOTIVOS_VALIDOS, { message: 'Seleccione el motivo' })
  motivo: string;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(500, { message: 'Las observaciones no pueden superar 500 caracteres' })
  observaciones?: string | null;

  @IsArray({ message: 'Marque al menos un elemento' })
  @ArrayMinSize(1, { message: 'Marque al menos un elemento' }) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => LineaDevolucionDto)
  lineas: LineaDevolucionDto[];
}

export class AnularDto {
  @Transform(texto) @IsString({ message: 'Explique por qué se anula' }) @IsNotEmpty({ message: 'Explique por qué se anula' })
  @MaxLength(255, { message: 'El motivo no puede superar 255 caracteres' })
  motivo: string;
}

/** Equipo o mueble que se entregó antes del sistema y aún no tiene placa: se crea al registrar el acta antigua. */
export class ActivoNuevoDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione el tipo de equipo o mueble' })
  elementoId: number;

  @Transform(({ value }) => (typeof value === 'number' ? String(value) : texto({ value })))
  @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'El serial no puede superar 80 caracteres' })
  serial?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80)
  marca?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80)
  modelo?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255)
  descripcionAdicional?: string | null;

  @IsIn(CONDICIONES, { message: 'Indique el estado físico' })
  condicion: string;
}

export class LineaAntiguaDto extends LineaEntregaDto {
  @IsOptional() @ValidateNested() @Type(() => ActivoNuevoDto)
  nuevo?: ActivoNuevoDto | null;
}

/** Entrega hecha antes del sistema, a partir del acta escaneada. */
export class ActaAntiguaDto {
  @IsIn(['DOTACION', 'EQUIPOS', 'MUEBLES', 'OTROS'], { message: 'Seleccione qué se entregó' })
  plantilla: 'DOTACION' | 'EQUIPOS' | 'MUEBLES' | 'OTROS';

  @Type(() => Number) @IsInt({ message: 'Seleccione el colaborador' })
  colaboradorId: number;

  @IsDateString({ strict: true }, { message: 'La fecha de la entrega no es válida' })
  fechaOriginal: string;

  /** true: el acta nueva sale con la fecha de hoy y hay que firmarla de nuevo; false: conserva la fecha original. */
  @IsBoolean({ message: 'Indique qué fecha lleva el acta' })
  usarFechaHoy: boolean;

  @IsIn(MOTIVOS_VALIDOS, { message: 'Seleccione el motivo' })
  motivo: string;

  @Transform(numero) @IsOptional() @opcional @IsInt()
  periodoDotacionId?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(150)
  ubicacion?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(500, { message: 'Las observaciones no pueden superar 500 caracteres' })
  observaciones?: string | null;

  @IsArray({ message: 'Agregue al menos un elemento' })
  @ArrayMinSize(1, { message: 'Agregue al menos un elemento' }) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => LineaAntiguaDto)
  lineas: LineaAntiguaDto[];
}
