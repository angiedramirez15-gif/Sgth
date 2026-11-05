import { Routes } from '@angular/router';
import { requierePermiso, requiereSesion, requiereSesionParaCambio, soloSinSesion } from './core/autenticacion';
import { MENU_ADMINISTRACION, MENU_PRINCIPAL } from './core/menu';

// Mientras se construyen, los módulos muestran una pantalla provisional.
// En cada fase se reemplaza loadComponent por el componente real del módulo.
const modulos: Routes = [...MENU_PRINCIPAL, ...MENU_ADMINISTRACION].map((m) => ({
  path: m.ruta,
  canActivate: [requierePermiso],
  data: { titulo: m.titulo, permisos: m.permisos, modulo: m },
  loadComponent: () => import('./features/en-construccion/en-construccion').then((c) => c.EnConstruccion),
}));

export const routes: Routes = [
  {
    path: 'ingresar',
    title: 'Ingresar · SGTH',
    canActivate: [soloSinSesion],
    loadComponent: () => import('./features/ingreso/ingreso').then((c) => c.Ingreso),
  },
  {
    path: 'cambiar-clave',
    title: 'Cambiar clave · SGTH',
    canActivate: [requiereSesionParaCambio],
    loadComponent: () => import('./features/cambiar-clave/cambiar-clave').then((c) => c.CambiarClave),
  },
  {
    path: '',
    canActivate: [requiereSesion],
    loadComponent: () => import('./layout/estructura').then((c) => c.Estructura),
    children: [
      {
        path: '',
        title: 'Inicio · SGTH',
        data: { titulo: 'Inicio' },
        loadComponent: () => import('./features/inicio/inicio').then((c) => c.Inicio),
      },
      ...modulos,
    ],
  },
  { path: '**', redirectTo: '' },
];
