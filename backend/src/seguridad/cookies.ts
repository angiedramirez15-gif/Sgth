import type { CookieOptions, Request, Response } from 'express';

/** Cookie con la sesión: JavaScript del navegador no la puede leer (httpOnly). */
export const COOKIE_SESION = 'sgth_sesion';
/** Cookie temporal entre la clave y el código de verificación. */
export const COOKIE_PREVIA = 'sgth_previa';
/** Cabecera que el frontend envía en cada petición: otra página no puede agregarla (protección CSRF). */
export const CABECERA_SGTH = 'x-sgth';

function opciones(req: Request, ruta = '/'): CookieOptions {
  // Sin maxAge: se borra al cerrar el navegador. Secure cuando el sistema corre con HTTPS.
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, path: ruta };
}

export function ponerSesion(req: Request, res: Response, token: string) {
  res.cookie(COOKIE_SESION, token, opciones(req));
  res.clearCookie(COOKIE_PREVIA, opciones(req, '/api/auth'));
}

export function ponerPrevia(req: Request, res: Response, token: string) {
  res.cookie(COOKIE_PREVIA, token, { ...opciones(req, '/api/auth'), maxAge: 10 * 60_000 });
}

export function borrarSesion(req: Request, res: Response) {
  res.clearCookie(COOKIE_SESION, opciones(req));
  res.clearCookie(COOKIE_PREVIA, opciones(req, '/api/auth'));
}
