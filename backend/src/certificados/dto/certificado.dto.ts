import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CertificadoDto {
  @IsBoolean({ message: 'Indique si el certificado lleva salario' })
  conSalario: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString({ message: 'Escriba a quién va dirigido' })
  @MaxLength(150, { message: '"Dirigido a" puede tener hasta 150 caracteres' })
  dirigidoA?: string;
}
