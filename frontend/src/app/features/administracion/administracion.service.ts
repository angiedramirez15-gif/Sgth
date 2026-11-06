import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

// ---------- Usuarios ----------
export type CodigoRol = 'ADMIN' | 'TH' | 'SST' | 'CONSULTA';

export interface Usuario {
  id: number;
  usuario: string;
  nombreCompleto: string;
  cargo: string;
  correo: string | null;
  rol: CodigoRol;
  rolNombre: string;
  activo: boolean;
  debeCambiarClave: boolean;
  bloqueado: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export interface DatosUsuario {
  usuario?: string;
  nombreCompleto: string;
  cargo: string;
  correo: string | null;
  rol: CodigoRol;
}

export interface Rol {
  id: number;
  codigo: CodigoRol;
  nombre: string;
  descripcion: string;
  permisos: { codigo: string; modulo: string; descripcion: string }[];
}

export interface UsuarioConClave {
  usuario: Usuario;
  claveTemporal: string;
}

// ---------- Catálogos ----------
export interface CampoCatalogo {
  columna: string;
  etiqueta: string;
  tipo: 'texto' | 'numero' | 'booleano' | 'opciones' | 'referencia';
  requerido?: boolean;
  maximo?: number;
  minimo?: number;
  opciones?: { valor: string; etiqueta: string }[];
  referencia?: string;
  ayuda?: string;
  enTabla?: boolean;
  formato?: 'correo' | 'mayusculas';
}

export interface DefinicionCatalogo {
  clave: string;
  titulo: string;
  singular: string;
  descripcion: string;
  columnaNombre: string;
  campos: CampoCatalogo[];
}

export type RegistroCatalogo = Record<string, unknown> & { id: number; activo: boolean };

// ---------- Configuración ----------
export interface Parametro {
  clave: string;
  etiqueta: string;
  grupo: string;
  tipo: 'texto' | 'numero' | 'dinero';
  minimo?: number;
  maximo?: number;
  sufijo?: string;
  editable: boolean;
  ayuda?: string;
  valor: string | null;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

/** Llamadas a la API de administración (Fase 2). */
@Injectable({ providedIn: 'root' })
export class AdministracionService {
  private readonly http = inject(HttpClient);

  usuarios = () => firstValueFrom(this.http.get<Usuario[]>('/api/usuarios'));
  roles = () => firstValueFrom(this.http.get<Rol[]>('/api/roles'));
  crearUsuario = (d: DatosUsuario) => firstValueFrom(this.http.post<UsuarioConClave>('/api/usuarios', d));
  editarUsuario = (id: number, d: DatosUsuario) => firstValueFrom(this.http.put<Usuario>(`/api/usuarios/${id}`, d));
  estadoUsuario = (id: number, activo: boolean) => firstValueFrom(this.http.patch<Usuario>(`/api/usuarios/${id}/estado`, { activo }));
  restablecerClave = (id: number) => firstValueFrom(this.http.post<UsuarioConClave>(`/api/usuarios/${id}/restablecer-clave`, {}));

  catalogos = () => firstValueFrom(this.http.get<DefinicionCatalogo[]>('/api/catalogos'));
  registros = (clave: string) => firstValueFrom(this.http.get<RegistroCatalogo[]>(`/api/catalogos/${clave}`));
  crearRegistro = (clave: string, datos: Record<string, unknown>) =>
    firstValueFrom(this.http.post<RegistroCatalogo>(`/api/catalogos/${clave}`, { datos }));
  editarRegistro = (clave: string, id: number, datos: Record<string, unknown>) =>
    firstValueFrom(this.http.put<RegistroCatalogo>(`/api/catalogos/${clave}/${id}`, { datos }));
  estadoRegistro = (clave: string, id: number, activo: boolean) =>
    firstValueFrom(this.http.patch<RegistroCatalogo>(`/api/catalogos/${clave}/${id}/estado`, { activo }));

  parametros = () => firstValueFrom(this.http.get<Parametro[]>('/api/configuracion'));
  guardarParametro = (clave: string, valor: string) => firstValueFrom(this.http.put<Parametro>(`/api/configuracion/${clave}`, { valor }));
}
