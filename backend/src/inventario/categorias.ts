import { ForbiddenException } from '@nestjs/common';
import type { UsuarioToken } from '../common/tipos.js';

export const CATEGORIAS_INVENTARIO = ['DOTACION', 'EPP', 'EQUIPO', 'MUEBLE', 'OTRO'] as const;
export type Categoria = (typeof CATEGORIAS_INVENTARIO)[number];

export interface DefinicionCategoria {
  titulo: string; // plural, para mensajes
  porUnidad: boolean; // true = cada unidad es un activo con placa (tabla activos)
  tallas: boolean; // la categoría puede manejar tallas
  codigoPlaca?: string; // EQ, MU
  permisoVer: string;
  permisoGestionar: string;
}

/**
 * Reglas de cada categoría del inventario.
 * Dotación la maneja Talento Humano; EPP, SST; equipos, muebles y otros, Talento Humano.
 */
export const CATEGORIAS: Record<Categoria, DefinicionCategoria> = {
  DOTACION: { titulo: 'dotación', porUnidad: false, tallas: true, permisoVer: 'inventario_dotacion.ver', permisoGestionar: 'inventario_dotacion.gestionar' },
  EPP: { titulo: 'EPP', porUnidad: false, tallas: true, permisoVer: 'inventario_epp.ver', permisoGestionar: 'inventario_epp.gestionar' },
  EQUIPO: { titulo: 'equipos', porUnidad: true, tallas: false, codigoPlaca: 'EQ', permisoVer: 'inventario_activos.ver', permisoGestionar: 'inventario_activos.gestionar' },
  MUEBLE: { titulo: 'muebles', porUnidad: true, tallas: false, codigoPlaca: 'MU', permisoVer: 'inventario_activos.ver', permisoGestionar: 'inventario_activos.gestionar' },
  OTRO: { titulo: 'otros elementos', porUnidad: false, tallas: false, permisoVer: 'inventario_activos.ver', permisoGestionar: 'inventario_activos.gestionar' },
};

export const PERMISOS_VER_INVENTARIO = [...new Set(Object.values(CATEGORIAS).map((c) => c.permisoVer))];
export const PERMISOS_GESTIONAR_INVENTARIO = [...new Set(Object.values(CATEGORIAS).map((c) => c.permisoGestionar))];

export function esCategoria(v: unknown): v is Categoria {
  return typeof v === 'string' && (CATEGORIAS_INVENTARIO as readonly string[]).includes(v);
}

/** Lanza 403 si el usuario no tiene el permiso de esa categoría. */
export function exigirPermiso(u: UsuarioToken, categoria: Categoria, accion: 'ver' | 'gestionar') {
  const def = CATEGORIAS[categoria];
  const permiso = accion === 'ver' ? def.permisoVer : def.permisoGestionar;
  // Quien puede gestionar también puede ver
  if (u.permisos.includes(permiso) || (accion === 'ver' && u.permisos.includes(def.permisoGestionar))) return;
  throw new ForbiddenException(
    accion === 'ver' ? `No tiene permiso para consultar el inventario de ${def.titulo}` : `No tiene permiso para modificar el inventario de ${def.titulo}`,
  );
}

/** Talla normalizada: "UNICA" si el elemento no maneja tallas. */
export function normalizarTalla(talla: unknown, manejaTallas: boolean): string | null {
  if (!manejaTallas) return 'UNICA';
  if (typeof talla !== 'string' && typeof talla !== 'number') return null;
  const t = String(talla).trim().toUpperCase().replace(/\s+/g, '');
  return t && t !== 'UNICA' && t.length <= 10 ? t : null;
}
