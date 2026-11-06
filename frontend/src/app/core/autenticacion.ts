import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SesionService } from './sesion.service';

/** Agrega el token a cada petición y cierra la sesión si el backend la rechaza. */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  const token = sesion.token();
  const peticion = token && req.url.startsWith('/api/')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      const esLogin = req.url.endsWith('/auth/login');
      if (error.status === 401 && !esLogin && sesion.autenticado()) {
        sesion.salir('expirada');
      } else if (error.status === 403 && /cambiar su clave/i.test(error.error?.message ?? '')) {
        router.navigate(['/cambiar-clave']);
      }
      return throwError(() => error);
    }),
  );
};

/** Solo deja entrar con sesión iniciada. Si debe cambiar la clave, lo lleva a esa pantalla. */
export const requiereSesion: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  if (!sesion.autenticado()) return router.createUrlTree(['/ingresar']);
  if (sesion.debeCambiarClave()) return router.createUrlTree(['/cambiar-clave']);
  return true;
};

/** Pantalla de cambio de clave: requiere sesión, aunque esté pendiente el cambio. */
export const requiereSesionParaCambio: CanActivateFn = () => {
  const sesion = inject(SesionService);
  return sesion.autenticado() ? true : inject(Router).createUrlTree(['/ingresar']);
};

/** Si ya hay sesión, la pantalla de ingreso lleva directo al inicio. */
export const soloSinSesion: CanActivateFn = () => {
  const sesion = inject(SesionService);
  return sesion.autenticado() ? inject(Router).createUrlTree(['/']) : true;
};

/** Exige al menos uno de los permisos indicados en data.permisos de la ruta. */
export const requierePermiso: CanActivateFn = (ruta) => {
  const sesion = inject(SesionService);
  const permisos = (ruta.data['permisos'] as string[] | undefined) ?? [];
  return sesion.puede(...permisos) ? true : inject(Router).createUrlTree(['/']);
};

/** Convierte un error del backend en un mensaje para mostrar. */
export function mensajeDeError(error: unknown, porDefecto = 'No se pudo completar la operación'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión con el servidor del SGTH. Verifique que esté encendido.';
    const m = error.error?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
  }
  return porDefecto;
}
