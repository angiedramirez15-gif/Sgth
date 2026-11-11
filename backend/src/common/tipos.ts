import type { Request } from 'express';

/** Datos del usuario que viajan dentro del token JWT. */
export interface UsuarioToken {
  sub: number; // id del usuario
  usuario: string;
  nombre: string;
  cargo: string;
  rol: string; // ADMIN, TH, SST, CONSULTA
  permisos: string[];
  cambiarClave: boolean;
  /** TEMPORAL = la asignó el administrador; VENCIDA = superó los días de vigencia */
  motivoClave: 'TEMPORAL' | 'VENCIDA' | null;
  /** Falta aceptar la versión vigente del compromiso de confidencialidad */
  aceptarCompromiso: boolean;
  dobleVerificacion: boolean;
  v: number; // version_sesion: si cambia en la base, el token deja de servir
  ini: number; // inicio de la sesión (segundos); la sesión dura como máximo 12 horas
}

export interface SolicitudAutenticada extends Request {
  usuario?: UsuarioToken;
}
