import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { LineaEntregaDto } from './acta.dto.js';

const texto = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().replace(/\s+/g, ' ');
  return v === '' ? null : v;
};
const opcional = ValidateIf((_, v) => v !== null && v !== undefined);

export class ItemMatrizDto {
  @Type(() => Number) @IsInt({ message: 'EPP no válido' })
  elementoId: number;

  @Type(() => Number) @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' }) @Max(50, { message: 'Revise la cantidad' })
  cantidad: number;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(255, { message: 'La observación no puede superar 255 caracteres' })
  observacion?: string | null;
}

export class MatrizCargoDto {
  @IsArray({ message: 'Lista de EPP no válida' }) @ArrayMaxSize(60, { message: 'Máximo 60 EPP por cargo' })
  @ValidateNested({ each: true }) @Type(() => ItemMatrizDto)
  items: ItemMatrizDto[];
}

export class PersonaPlanillaDto {
  @Type(() => Number) @IsInt({ message: 'Colaborador no válido' })
  colaboradorId: number;

  @IsArray() @ArrayMinSize(1, { message: 'Cada persona debe recibir al menos un EPP' }) @ArrayMaxSize(30)
  @ValidateNested({ each: true }) @Type(() => LineaEntregaDto)
  lineas: LineaEntregaDto[];
}

/** Entrega grupal: varias personas firman en la misma planilla. */
export class PlanillaDto {
  @IsDateString({ strict: true }, { message: 'La fecha de entrega no es válida' })
  fecha: string;

  @IsIn(['INGRESO', 'REPOSICION_VIDA_UTIL', 'DANO', 'PERDIDA', 'CAMBIO_CARGO', 'OTRO'], { message: 'Seleccione el motivo' })
  motivo: string;

  @Transform(texto) @IsOptional() @opcional @IsString() @MaxLength(500, { message: 'Las observaciones no pueden superar 500 caracteres' })
  observaciones?: string | null;

  @IsArray({ message: 'Agregue a las personas' })
  @ArrayMinSize(2, { message: 'Una planilla es para dos personas o más; para una sola use la entrega individual' })
  @ArrayMaxSize(40, { message: 'Máximo 40 personas por planilla' })
  @ValidateNested({ each: true }) @Type(() => PersonaPlanillaDto)
  personas: PersonaPlanillaDto[];
}
