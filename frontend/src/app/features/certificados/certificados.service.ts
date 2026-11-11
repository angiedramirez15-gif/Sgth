import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Certificado {
  id: number;
  consecutivo: string;
  fechaExpedicion: string;
  conSalario: boolean;
  dirigidoA: string | null;
  cargo: string;
  tipoContrato: string;
  firmante: string;
  creadoPor: string;
  creadoEn: string;
}

export interface EstadoCertificado {
  faltantes: string[];
  tieneSalario: boolean;
  puedeConSalario: boolean;
  retirado: boolean;
  firmante: { nombre: string; cargo: string };
}

@Injectable({ providedIn: 'root' })
export class CertificadosService {
  private readonly http = inject(HttpClient);

  listar = (colaboradorId: number) => firstValueFrom(this.http.get<Certificado[]>(`/api/colaboradores/${colaboradorId}/certificados`));
  estado = (colaboradorId: number) => firstValueFrom(this.http.get<EstadoCertificado>(`/api/colaboradores/${colaboradorId}/certificados/estado`));
  crear = (colaboradorId: number, conSalario: boolean, dirigidoA: string | null) =>
    firstValueFrom(this.http.post<Certificado>(`/api/colaboradores/${colaboradorId}/certificados`, { conSalario, ...(dirigidoA ? { dirigidoA } : {}) }));
  pdf = (id: number) => firstValueFrom(this.http.get(`/api/certificados/${id}/pdf`, { responseType: 'blob' }));

  // Configuración
  faltantes = () => firstValueFrom(this.http.get<{ faltantes: string[] }>('/api/certificados/configuracion'));
  firma = () => firstValueFrom(this.http.get('/api/certificados/firma', { responseType: 'blob' }));
  subirFirma = (archivo: File) => {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return firstValueFrom(this.http.post<{ tieneFirma: boolean }>('/api/certificados/firma', datos));
  };
}

/** "el NIT y la firma" */
export function unirLista(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
