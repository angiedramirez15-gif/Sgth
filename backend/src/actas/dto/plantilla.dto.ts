import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const texto = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/[ \t]+/g, ' ') : value);

export class PlantillaDto {
  @Transform(texto) @IsString({ message: 'Escriba el título' }) @IsNotEmpty({ message: 'Escriba el título' })
  @MaxLength(150, { message: 'El título no puede superar 150 caracteres' })
  titulo: string;

  @Transform(texto) @IsString({ message: 'Escriba la introducción' }) @IsNotEmpty({ message: 'Escriba la introducción' })
  @MaxLength(3000, { message: 'La introducción no puede superar 3.000 caracteres' })
  textoIntroduccion: string;

  @Transform(texto) @IsString({ message: 'Escriba la frase antes de las cláusulas' }) @IsNotEmpty({ message: 'Escriba la frase antes de las cláusulas' })
  @MaxLength(150, { message: 'La frase no puede superar 150 caracteres' })
  textoManifiesta: string;

  @Transform(({ value }) => (Array.isArray(value) ? value.map((c) => (typeof c === 'string' ? c.trim().replace(/[ \t]+/g, ' ') : c)).filter((c) => c !== '') : value))
  @IsArray({ message: 'Agregue las cláusulas' })
  @ArrayMinSize(1, { message: 'El acta debe tener al menos una cláusula' }) @ArrayMaxSize(30, { message: 'Máximo 30 cláusulas' })
  @IsString({ each: true }) @MaxLength(2000, { each: true, message: 'Cada cláusula puede tener hasta 2.000 caracteres' })
  clausulas: string[];
}
