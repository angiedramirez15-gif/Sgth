import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Categoria, Condicion } from '../inventario/inventario.service';

export type Plantilla = 'DOTACION' | 'EPP' | 'EQUIPOS' | 'MUEBLES' | 'OTROS' | 'DEVOLUCION';
export type PlantillaEntrega = 'DOTACION' | 'EQUIPOS' | 'MUEBLES' | 'OTROS';
export type EstadoActa = 'PENDIENTE_ACTA' | 'COMPLETA' | 'ANULADA';

export interface FilaActa {
  id: number;
  consecutivo: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  plantilla: Plantilla;
  esHistorica: boolean;
  colaboradorId: number;
  colaborador: string;
  documento: string;
  fecha: string;
  motivo: string;
  estado: EstadoActa;
  elementos: number;
  resumen: string;
  registradaPor: string;
}

export interface LineaActa {
  id: number;
  elementoId: number;
  elemento: string;
  categoria: Categoria;
  unidad: string;
  activoId: number | null;
  placa: string | null;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  talla: string;
  cantidad: number;
  condicion: Condicion | null;
  observaciones: string | null;
}

export interface Acta {
  id: number;
  consecutivo: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  plantilla: Plantilla;
  plantillaNombre: string;
  esHistorica: boolean;
  colaboradorId: number;
  colaborador: string;
  colaboradorAnteriorId: number | null;
  colaboradorAnterior: string | null;
  fecha: string;
  fechaEntregaOriginal: string | null;
  motivo: string;
  motivoTexto: string;
  periodo: string | null;
  ubicacion: string | null;
  observaciones: string | null;
  estado: EstadoActa;
  registradaPor: string;
  creadoEn: string;
  tieneFirmada: boolean;
  tieneSoporte: boolean;
  fechaCargaFirmada: string | null;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  lineas: LineaActa[];
}

export interface OpcionesActas {
  motivos: Record<Plantilla, { valor: string; etiqueta: string }[]>;
  periodos: { id: number; anio: number; numero: number; fechaLimite: string; texto: string }[];
  actual: number | null;
}

export interface Tenencia {
  activos: { id: number; placa: string; elemento: string; categoria: Categoria; serial: string | null; marca: string | null; modelo: string | null; condicion: Condicion; desde: string | null; acta: string | null; actaId: number | null }[];
  cantidades: { elementoId: number; elemento: string; categoria: Categoria; unidad: string; manejaTallas: boolean; talla: string; cantidad: number }[];
  dotacion: { periodoId: number; numero: number; anio: number; consecutivo: string; actaId: number; fecha: string }[];
  tallas: { tipo: string; talla: string }[];
}

export interface DatosEntrega {
  plantilla: PlantillaEntrega;
  colaboradorId: number;
  fecha: string;
  motivo: string;
  periodoDotacionId?: number | null;
  ubicacion?: string | null;
  colaboradorAnteriorId?: number | null;
  observaciones?: string | null;
  lineas: { activoId?: number; elementoId?: number; talla?: string | null; cantidad?: number }[];
}

export interface DatosDevolucion {
  colaboradorId: number;
  fecha: string;
  motivo: string;
  observaciones?: string | null;
  lineas: { activoId?: number; elementoId?: number; talla?: string; cantidad?: number; condicion: Condicion; quedaEn?: string; reingresa?: boolean; observaciones?: string | null }[];
}

export const ESTADOS_ACTA: Record<EstadoActa, string> = {
  PENDIENTE_ACTA: 'Falta la firmada',
  COMPLETA: 'Firmada',
  ANULADA: 'Anulada',
};

export const TIPOS_ENTREGA: { valor: PlantillaEntrega; etiqueta: string; icono: string; permiso: string; ayuda: string }[] = [
  { valor: 'DOTACION', etiqueta: 'Dotación', icono: 'apparel', permiso: 'actas_dotacion.gestionar', ayuda: 'Uniformes y calzado, por talla' },
  { valor: 'EQUIPOS', etiqueta: 'Equipos', icono: 'devices', permiso: 'actas_activos.gestionar', ayuda: 'Computadores, celulares, herramientas' },
  { valor: 'MUEBLES', etiqueta: 'Muebles', icono: 'chair', permiso: 'actas_activos.gestionar', ayuda: 'Sillas, escritorios, archivadores' },
  { valor: 'OTROS', etiqueta: 'Otros', icono: 'key', permiso: 'actas_activos.gestionar', ayuda: 'Llaves, carnés, tarjetas' },
];

/** Tipo de talla del colaborador que corresponde a un elemento, según su grupo o nombre. */
export function tipoTallaDe(texto: string): string | null {
  const t = texto.toLowerCase();
  if (/(bota|zapato|calzado|tenis)/.test(t)) return 'CALZADO';
  if (/(pantal|jean|bermuda)/.test(t)) return 'PANTALON';
  if (/(overol|enterizo)/.test(t)) return 'OVEROL';
  if (/(guante)/.test(t)) return 'GUANTES';
  if (/(camis|polo|chaqueta|blusa|buzo|chaleco|uniforme)/.test(t)) return 'CAMISA';
  return null;
}

@Injectable({ providedIn: 'root' })
export class ActasService {
  private readonly http = inject(HttpClient);

  listar = (colaboradorId?: number) =>
    firstValueFrom(this.http.get<FilaActa[]>('/api/actas', { params: colaboradorId ? { colaboradorId } : {} }));
  obtener = (id: number) => firstValueFrom(this.http.get<Acta>(`/api/actas/${id}`));
  opciones = () => firstValueFrom(this.http.get<OpcionesActas>('/api/actas/opciones'));
  tenencia = (colaboradorId: number) => firstValueFrom(this.http.get<Tenencia>(`/api/colaboradores/${colaboradorId}/tenencia`));
  entregar = (d: DatosEntrega) => firstValueFrom(this.http.post<Acta>('/api/actas/entregas', d));
  devolver = (d: DatosDevolucion) => firstValueFrom(this.http.post<Acta>('/api/actas/devoluciones', d));
  anular = (id: number, motivo: string) => firstValueFrom(this.http.post<Acta>(`/api/actas/${id}/anular`, { motivo }));
  pdf = (id: number) => firstValueFrom(this.http.get(`/api/actas/${id}/pdf`, { responseType: 'blob' }));
  antigua = (datos: FormData) => firstValueFrom(this.http.post<Acta>('/api/actas/antiguas', datos));
  original = (id: number) => firstValueFrom(this.http.get(`/api/actas/${id}/original`, { responseType: 'blob' }));
  firmada = (id: number) => firstValueFrom(this.http.get(`/api/actas/${id}/firmada`, { responseType: 'blob' }));
  subirFirmada = (id: number, archivo: File) => {
    const f = new FormData();
    f.append('archivo', archivo);
    return firstValueFrom(this.http.post<Acta>(`/api/actas/${id}/firmada`, f));
  };
}

/** Hoy en Colombia como 'YYYY-MM-DD'. */
export function hoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
