import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { requierePermiso, requiereSesion, requiereSesionParaCambio, soloSinSesion } from './core/autenticacion';
import { MENU_ADMINISTRACION, MENU_PRINCIPAL } from './core/menu';

// Pantallas ya construidas. Las demás opciones del menú muestran una pantalla provisional.
const PANTALLAS: Record<string, () => Promise<Type<unknown>>> = {
  'administracion/usuarios': () => import('./features/administracion/usuarios/usuarios').then((c) => c.Usuarios),
  'administracion/catalogos': () => import('./features/administracion/catalogos/catalogos').then((c) => c.Catalogos),
  'administracion/configuracion': () => import('./features/administracion/configuracion/configuracion').then((c) => c.Configuracion),
};

const modulos: Routes = [...MENU_PRINCIPAL, ...MENU_ADMINISTRACION].map((m) => ({
  path: m.ruta,
  title: `${m.titulo} · SGTH`,
  canActivate: [requierePermiso],
  data: { titulo: m.titulo, permisos: m.permisos, modulo: m },
  loadComponent: PANTALLAS[m.ruta] ?? (() => import('./features/en-construccion/en-construccion').then((c) => c.EnConstruccion)),
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
