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
}

export interface SolicitudAutenticada extends Request {
  usuario?: UsuarioToken;
}
