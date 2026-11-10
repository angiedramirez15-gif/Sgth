import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { CATEGORIAS_INVENTARIO } from '../categorias.js';

/** Texto: recorta espacios y convierte "" en null. */
const texto = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().replace(/\s+/g, ' ');
  return v === '' ? null : v;
};
const numero = ({ value }: { value: unknown }) => (value === '' || value === null || value === undefined ? null : Number(value));
const opcional = ValidateIf((_, v) => v !== null && v !== undefined);

export const CONDICIONES = ['NUEVO', 'BUENO', 'REGULAR', 'MALO'] as const;

// ---------- Catálogo de elementos ----------

export class ElementoDto {
  @IsIn(CATEGORIAS_INVENTARIO, { message: 'Seleccione la categoría' })
  categoria: string;

  @Transform(texto) @IsString({ message: 'Escriba el nombre del elemento' }) @IsNotEmpty({ message: 'Escriba el nombre del elemento' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombre: string;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'La subcategoría no puede superar 80 caracteres' })
  subcategoria?: string | null;

  @Transform(texto) @IsString({ message: 'Escriba la unidad (Und, Par, Juego…)' }) @IsNotEmpty({ message: 'Escriba la unidad (Und, Par, Juego…)' })
  @MaxLength(20, { message: 'La unidad no puede superar 20 caracteres' })
  unidad: string;

  @IsOptional() @IsBoolean({ message: 'Indique si maneja tallas' })
  manejaTallas?: boolean;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(150, { message: 'La norma no puede superar 150 caracteres' })
  normaCertificacion?: string | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'La vida útil debe ser un número entero de días' })
  @Min(1, { message: 'La vida útil debe ser de al menos 1 día' }) @Max(3650, { message: 'La vida útil no puede superar 10 años' })
  vidaUtilDias?: number | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' }) @Max(100000)
  stockMinimo?: number | null;
}

export class EstadoRegistroDto {
  @IsBoolean({ message: 'Indique si queda activo' })
  activo: boolean;
}

// ---------- Entradas y ajustes de stock ----------

export class LineaEntradaDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione el elemento' })
  elementoId: number;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(10, { message: 'La talla no puede superar 10 caracteres' })
  talla?: string | null;

  @Type(() => Number) @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' }) @Max(100000, { message: 'Revise la cantidad' })
  cantidad: number;
}

export class EntradaDto {
  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Proveedor no válido' })
  proveedorId?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(40, { message: 'El número de factura no puede superar 40 caracteres' })
  numeroFactura?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'La observación no puede superar 255 caracteres' })
  observacion?: string | null;

  @IsArray({ message: 'Agregue al menos un elemento' })
  @ArrayMinSize(1, { message: 'Agregue al menos un elemento' }) @ArrayMaxSize(200, { message: 'Máximo 200 líneas por entrada' })
  @ValidateNested({ each: true }) @Type(() => LineaEntradaDto)
  lineas: LineaEntradaDto[];
}

export class AjusteDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione el elemento' })
  elementoId: number;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(10)
  talla?: string | null;

  @IsIn(['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'], { message: 'Indique si el ajuste suma o resta' })
  tipo: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';

  @Type(() => Number) @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' }) @Max(100000, { message: 'Revise la cantidad' })
  cantidad: number;

  @Transform(texto) @IsString({ message: 'Explique el motivo del ajuste' }) @IsNotEmpty({ message: 'Explique el motivo del ajuste' })
  @MaxLength(255, { message: 'El motivo no puede superar 255 caracteres' })
  observacion: string;
}

// ---------- Activos (equipos y muebles) ----------

export class ActivoDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione el tipo de equipo o mueble' })
  elementoId: number;

  @Transform(({ value }) => (typeof value === 'number' ? String(value) : texto({ value })))
  @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'El serial no puede superar 80 caracteres' })
  serial?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'La marca no puede superar 80 caracteres' })
  marca?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(80, { message: 'El modelo no puede superar 80 caracteres' })
  modelo?: string | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'La descripción no puede superar 255 caracteres' })
  descripcionAdicional?: string | null;

  @IsIn(CONDICIONES, { message: 'Seleccione el estado físico' })
  condicion: string;

  @Transform(texto) @IsOptional() @opcional @IsDateString({ strict: true }, { message: 'La fecha de compra no es válida' })
  fechaCompra?: string | null;

  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'Proveedor no válido' })
  proveedorId?: number | null;

  @Transform(({ value }) => (typeof value === 'string' ? numero({ value: value.replace(/[$\s.]/g, '').replace(',', '.') }) : numero({ value })))
  @IsOptional() @opcional @IsNumber({}, { message: 'El valor de compra debe ser un número' })
  @Min(0, { message: 'El valor de compra no puede ser negativo' }) @Max(9_999_999_999, { message: 'Revise el valor de compra' })
  valorCompra?: number | null;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'Las observaciones no pueden superar 255 caracteres' })
  observaciones?: string | null;

  /** Solo al crear: registrar varias unidades iguales sin serial (ej.: 10 sillas). */
  @Transform(numero) @IsOptional() @opcional @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' }) @Max(200, { message: 'Máximo 200 unidades a la vez' })
  cantidad?: number | null;
}

export class EstadoActivoDto {
  @IsIn(['DISPONIBLE', 'EN_REPARACION', 'DADO_DE_BAJA'], { message: 'Estado no válido' })
  estado: 'DISPONIBLE' | 'EN_REPARACION' | 'DADO_DE_BAJA';

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'La observación no puede superar 255 caracteres' })
  observacion?: string | null;
}

export class StickersDto {
  @IsArray({ message: 'Seleccione los activos' })
  @ArrayMinSize(1, { message: 'Seleccione al menos un activo' }) @ArrayMaxSize(500, { message: 'Máximo 500 stickers a la vez' })
  @IsInt({ each: true, message: 'Lista de activos no válida' })
  ids: number[];

  /** Posición de la primera etiqueta en la hoja (1 a 10), para reutilizar hojas ya empezadas. */
  @Transform(numero) @IsOptional() @opcional @IsInt() @Min(1, { message: 'La posición va de 1 a 10' }) @Max(10, { message: 'La posición va de 1 a 10' })
  posicionInicial?: number | null;

  /** Dibuja el borde de cada etiqueta, para imprimir en papel normal y recortar. */
  @IsOptional() @IsBoolean()
  bordes?: boolean;
}
