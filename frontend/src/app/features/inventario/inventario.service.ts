import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Categoria = 'DOTACION' | 'EPP' | 'EQUIPO' | 'MUEBLE' | 'OTRO';
export type EstadoActivo = 'DISPONIBLE' | 'ASIGNADO' | 'EN_REPARACION' | 'DADO_DE_BAJA';
export type Condicion = 'NUEVO' | 'BUENO' | 'REGULAR' | 'MALO';

export interface Elemento {
  id: number;
  categoria: Categoria;
  nombre: string;
  subcategoria: string | null;
  unidad: string;
  porUnidad: boolean;
  manejaTallas: boolean;
  normaCertificacion: string | null;
  vidaUtilDias: number | null;
  stockMinimo: number | null;
  activo: boolean;
  existencias: { talla: string; cantidad: number }[];
  total: number;
  unidades?: { disponibles: number; asignados: number; enReparacion: number; deBaja: number };
}

export interface DatosElemento {
  categoria: Categoria;
  nombre: string;
  subcategoria: string | null;
  unidad: string;
  manejaTallas: boolean;
  normaCertificacion: string | null;
  vidaUtilDias: number | null;
  stockMinimo: number | null;
}

export interface Movimiento {
  id: number;
  fecha: string;
  tipo: string;
  talla: string;
  cantidad: number;
  placa: string | null;
  proveedor: string | null;
  numeroFactura: string | null;
  acta: string | null;
  actaId: number | null;
  usuario: string;
  observacion: string | null;
  signo: number;
}

export interface Activo {
  id: number;
  placa: string;
  elementoId: number;
  elemento: string;
  categoria: 'EQUIPO' | 'MUEBLE';
  unidad: string;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  descripcionAdicional: string | null;
  estado: EstadoActivo;
  condicion: Condicion;
  colaboradorId: number | null;
  colaborador: string | null;
  colaboradorCargo: string | null;
  fechaCompra: string | null;
  proveedorId: number | null;
  proveedor: string | null;
  valorCompra: number | null;
  observaciones: string | null;
  creadoEn: string;
}

export interface DatosActivo {
  elementoId: number;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  descripcionAdicional: string | null;
  condicion: Condicion;
  fechaCompra: string | null;
  proveedorId: number | null;
  valorCompra: number | null;
  observaciones: string | null;
  cantidad?: number | null;
}

export interface HistorialActivo {
  fecha: string;
  tipo: string;
  descripcion: string;
  actaId: number | null;
  acta: string | null;
  usuario: string;
}

export const ESTADOS_ACTIVO: Record<EstadoActivo, string> = {
  DISPONIBLE: 'Disponible',
  ASIGNADO: 'Asignado',
  EN_REPARACION: 'En reparación',
  DADO_DE_BAJA: 'Dado de baja',
};

export const CONDICIONES: { valor: Condicion; etiqueta: string }[] = [
  { valor: 'NUEVO', etiqueta: 'Nuevo' },
  { valor: 'BUENO', etiqueta: 'Bueno' },
  { valor: 'REGULAR', etiqueta: 'Regular' },
  { valor: 'MALO', etiqueta: 'Malo' },
];

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Entrega',
  DEVOLUCION: 'Devolución',
  AJUSTE_POSITIVO: 'Ajuste (suma)',
  AJUSTE_NEGATIVO: 'Ajuste (resta)',
  BAJA: 'Baja',
  ANULACION: 'Acta anulada',
};

/** Textos de cada categoría para las pantallas. */
export const CATEGORIAS: Record<Categoria, { titulo: string; singular: string; ejemplo: string; tallas: boolean }> = {
  DOTACION: { titulo: 'Dotación', singular: 'elemento de dotación', ejemplo: 'Camisa tipo polo, botas de cuero, jean', tallas: true },
  EPP: { titulo: 'EPP', singular: 'EPP', ejemplo: 'Casco, guantes de nitrilo, gafas de seguridad', tallas: true },
  EQUIPO: { titulo: 'Equipos', singular: 'tipo de equipo', ejemplo: 'Computador portátil, celular, taladro', tallas: false },
  MUEBLE: { titulo: 'Muebles', singular: 'tipo de mueble', ejemplo: 'Silla ergonómica, escritorio, archivador', tallas: false },
  OTRO: { titulo: 'Otros elementos', singular: 'elemento', ejemplo: 'Llave de oficina, carné, tarjeta de acceso', tallas: false },
};

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly http = inject(HttpClient);

  elementos = (categoria: Categoria) => firstValueFrom(this.http.get<Elemento[]>('/api/inventario/elementos', { params: { categoria } }));
  crearElemento = (d: DatosElemento) => firstValueFrom(this.http.post<Elemento>('/api/inventario/elementos', d));
  editarElemento = (id: number, d: DatosElemento) => firstValueFrom(this.http.put<Elemento>(`/api/inventario/elementos/${id}`, d));
  estadoElemento = (id: number, activo: boolean) => firstValueFrom(this.http.patch(`/api/inventario/elementos/${id}/estado`, { activo }));
  movimientos = (id: number) => firstValueFrom(this.http.get<Movimiento[]>(`/api/inventario/elementos/${id}/movimientos`));

  entrada = (d: { proveedorId: number | null; numeroFactura: string | null; observacion: string | null; lineas: { elementoId: number; talla: string | null; cantidad: number }[] }) =>
    firstValueFrom(this.http.post<{ lineas: { elemento: string; talla: string; cantidad: number; saldo: number }[] }>('/api/inventario/entradas', d));
  ajuste = (d: { elementoId: number; talla: string | null; tipo: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'; cantidad: number; observacion: string }) =>
    firstValueFrom(this.http.post<{ elemento: string; talla: string; saldo: number }>('/api/inventario/ajustes', d));
  proveedores = () => firstValueFrom(this.http.get<{ id: number; nombre: string }[]>('/api/inventario/proveedores'));

  activos = () => firstValueFrom(this.http.get<Activo[]>('/api/inventario/activos'));
  activo = (id: number) => firstValueFrom(this.http.get<Activo>(`/api/inventario/activos/${id}`));
  historial = (id: number) => firstValueFrom(this.http.get<HistorialActivo[]>(`/api/inventario/activos/${id}/historial`));
  crearActivo = (d: DatosActivo) => firstValueFrom(this.http.post<Activo[]>('/api/inventario/activos', d));
  editarActivo = (id: number, d: DatosActivo) => firstValueFrom(this.http.put<Activo>(`/api/inventario/activos/${id}`, d));
  estadoActivo = (id: number, estado: EstadoActivo, observacion: string | null) =>
    firstValueFrom(this.http.patch<Activo>(`/api/inventario/activos/${id}/estado`, { estado, observacion }));
  stickers = (ids: number[], posicionInicial: number, bordes: boolean) =>
    firstValueFrom(this.http.post('/api/inventario/activos/stickers', { ids, posicionInicial, bordes }, { responseType: 'blob' }));
}

/** Abre un PDF en una pestaña nueva (la pestaña se abre antes para que el navegador no la bloquee). */
export async function abrirPdf(obtener: () => Promise<Blob>, nombre: string) {
  const ventana = window.open('', '_blank');
  try {
    const blob = await obtener();
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else {
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    ventana?.close();
    throw e;
  }
}
