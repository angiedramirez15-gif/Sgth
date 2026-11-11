import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Categoria, Condicion } from '../inventario/inventario.service';

export type Plantilla = 'DOTACION' | 'EPP' | 'EQUIPOS' | 'MUEBLES' | 'OTROS' | 'DEVOLUCION';
export type PlantillaEntrega = 'DOTACION' | 'EPP' | 'EQUIPOS' | 'MUEBLES' | 'OTROS';
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
  fechaReposicion: string | null;
  repuesto: number;
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
  planillaId: number | null;
  planilla: string | null;
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
  lineas: { activoId?: number; elementoId?: number; talla?: string | null; cantidad?: number; fechaReposicion?: string | null }[];
}

export interface DatosDevolucion {
  colaboradorId: number;
  fecha: string;
  motivo: string;
  observaciones?: string | null;
  lineas: { activoId?: number; elementoId?: number; talla?: string; cantidad?: number; condicion: Condicion; quedaEn?: string; reingresa?: boolean; observaciones?: string | null }[];
}

export const ESTADOS_ACTA: Record<EstadoActa, string> = {
  PENDIENTE_ACTA: 'Falta firma',
  COMPLETA: 'Firmada',
  ANULADA: 'Anulada',
};

export const TIPOS_ENTREGA: { valor: PlantillaEntrega; etiqueta: string; icono: string; permiso: string; ayuda: string }[] = [
  { valor: 'DOTACION', etiqueta: 'Dotación', icono: 'apparel', permiso: 'actas_dotacion.gestionar', ayuda: 'Uniformes y calzado, por talla' },
  { valor: 'EPP', etiqueta: 'EPP', icono: 'health_and_safety', permiso: 'actas_epp.gestionar', ayuda: 'Protección personal, con reposición' },
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

// ---------- EPP ----------

export type EstadoEpp = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'SIN_ENTREGAR';

export interface EppColaborador {
  cargo: string;
  diasAlerta: number;
  retirado: boolean;
  epp: {
    elementoId: number; nombre: string; requerido: boolean; cantidadRequerida: number; manejaTallas: boolean; talla: string | null;
    cantidad: number; entregado: string | null; reposicion: string | null; dias: number | null; acta: string | null; actaId: number | null; estado: EstadoEpp;
  }[];
}

export interface CargoMatriz {
  id: number; nombre: string; area: string | null; riesgo: number | null; colaboradores: number;
  items: { elementoId: number; nombre: string; cantidad: number; observacion: string | null; vidaUtilDias: number | null; activo: boolean }[];
}

export interface Reposiciones {
  diasAlerta: number;
  porReponer: { detalleId: number; actaId: number; acta: string; colaboradorId: number; colaborador: string; cargo: string; elementoId: number; epp: string; talla: string; cantidad: number; reposicion: string; dias: number }[];
  sinEntregar: { colaboradorId: number; colaborador: string; cargo: string; elementoId: number; epp: string; cantidad: number }[];
}

export interface FilaPlanilla { id: number; consecutivo: string; fecha: string; motivo: string; motivoTexto: string; personas: number; anuladas: number; firmada: boolean; registradaPor: string }

export interface Planilla {
  id: number; consecutivo: string; fecha: string; motivo: string; motivoTexto: string; observaciones: string | null; registradaPor: string; creadoEn: string;
  firmada: boolean; fechaCargaFirmada: string | null;
  personas: { id: number; consecutivo: string; estado: EstadoActa; colaboradorId: number; colaborador: string; documento: string; cargo: string; lineas: { epp: string; talla: string; cantidad: number; unidad: string; reposicion: string }[] }[];
}

export const ESTADOS_EPP: Record<EstadoEpp, string> = { VIGENTE: 'Vigente', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido', SIN_ENTREGAR: 'Sin entregar' };

@Injectable({ providedIn: 'root' })
export class EppService {
  private readonly http = inject(HttpClient);

  matriz = () => firstValueFrom(this.http.get<CargoMatriz[]>('/api/epp/matriz'));
  guardarMatriz = (cargoId: number, items: { elementoId: number; cantidad: number; observacion: string | null }[]) =>
    firstValueFrom(this.http.put<{ ok: boolean }>(`/api/epp/matriz/${cargoId}`, { items }));
  reposiciones = () => firstValueFrom(this.http.get<Reposiciones>('/api/epp/reposiciones'));
  estado = (colaboradorId: number) => firstValueFrom(this.http.get<EppColaborador>(`/api/colaboradores/${colaboradorId}/epp`));
  planillas = () => firstValueFrom(this.http.get<FilaPlanilla[]>('/api/epp/planillas'));
  planilla = (id: number) => firstValueFrom(this.http.get<Planilla>(`/api/epp/planillas/${id}`));
  crearPlanilla = (d: { fecha: string; motivo: string; observaciones: string | null; personas: { colaboradorId: number; lineas: { elementoId: number; talla: string | null; cantidad: number }[] }[] }) =>
    firstValueFrom(this.http.post<Planilla>('/api/epp/planillas', d));
  pdfPlanilla = (id: number) => firstValueFrom(this.http.get(`/api/epp/planillas/${id}/pdf`, { responseType: 'blob' }));
  firmadaPlanilla = (id: number) => firstValueFrom(this.http.get(`/api/epp/planillas/${id}/firmada`, { responseType: 'blob' }));
  subirPlanilla = (id: number, archivo: File) => {
    const f = new FormData();
    f.append('archivo', archivo);
    return firstValueFrom(this.http.post<Planilla>(`/api/epp/planillas/${id}/firmada`, f));
  };
}
