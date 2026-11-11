import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { requierePermiso, requiereSesion, requiereSesionParaCambio, soloSinSesion } from './core/autenticacion';
import { MENU_ADMINISTRACION, MENU_PRINCIPAL } from './core/menu';

// Pantallas ya construidas. Las demás opciones del menú muestran una pantalla provisional.
const PANTALLAS: Record<string, () => Promise<Type<unknown>>> = {
  colaboradores: () => import('./features/colaboradores/listado/listado').then((c) => c.Listado),
  'administracion/usuarios': () => import('./features/administracion/usuarios/usuarios').then((c) => c.Usuarios),
  'administracion/catalogos': () => import('./features/administracion/catalogos/catalogos').then((c) => c.Catalogos),
  dotacion: () => import('./features/inventario/dotacion/dotacion').then((c) => c.Dotacion),
  actas: () => import('./features/actas/listado/listado-actas').then((c) => c.ListadoActas),
  epp: () => import('./features/epp/epp').then((c) => c.Epp),
  equipos: () => import('./features/inventario/equipos/equipos').then((c) => c.Equipos),
  'administracion/plantillas': () => import('./features/administracion/plantillas/plantillas').then((c) => c.Plantillas),
  alertas: () => import('./features/alertas/alertas').then((c) => c.Alertas),
  reportes: () => import('./features/reportes/reportes').then((c) => c.Reportes),
  'administracion/configuracion': () => import('./features/administracion/configuracion/configuracion').then((c) => c.Configuracion),
};

// Pantallas internas de Colaboradores (además del listado)
const colaboradores: Routes = [
  { path: 'colaboradores/nuevo', title: 'Nuevo colaborador · SGTH', canActivate: [requierePermiso], data: { titulo: 'Colaboradores', permisos: ['colaboradores.gestionar'] },
    loadComponent: () => import('./features/colaboradores/formulario/formulario').then((c) => c.Formulario) },
  { path: 'colaboradores/importar', title: 'Importar colaboradores · SGTH', canActivate: [requierePermiso], data: { titulo: 'Colaboradores', permisos: ['colaboradores.gestionar'] },
    loadComponent: () => import('./features/colaboradores/importacion/importacion').then((c) => c.Importacion) },
  { path: 'colaboradores/:id/editar', title: 'Editar colaborador · SGTH', canActivate: [requierePermiso], data: { titulo: 'Colaboradores', permisos: ['colaboradores.gestionar'] },
    loadComponent: () => import('./features/colaboradores/formulario/formulario').then((c) => c.Formulario) },
  { path: 'colaboradores/:id', title: 'Ficha del colaborador · SGTH', canActivate: [requierePermiso], data: { titulo: 'Colaboradores', permisos: ['colaboradores.ver'] },
    loadComponent: () => import('./features/colaboradores/ficha/ficha').then((c) => c.Ficha) },
];

// Ficha de un equipo o mueble (la abre el QR del sticker)
const inventario: Routes = [
  { path: 'equipos/activos/:id', title: 'Equipo o mueble · SGTH', canActivate: [requierePermiso], data: { titulo: 'Equipos y muebles', permisos: ['inventario_activos.ver', 'inventario_activos.gestionar'] },
    loadComponent: () => import('./features/inventario/activo/activo').then((c) => c.ActivoFicha) },
];

// Entregas, devoluciones y detalle de cada acta
const actas: Routes = [
  { path: 'actas/entrega', title: 'Nueva entrega · SGTH', canActivate: [requierePermiso], data: { titulo: 'Actas', permisos: ['actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar'] },
    loadComponent: () => import('./features/actas/entrega/entrega').then((c) => c.Entrega) },
  { path: 'actas/antigua', title: 'Registrar acta antigua · SGTH', canActivate: [requierePermiso], data: { titulo: 'Actas', permisos: ['actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar'] },
    loadComponent: () => import('./features/actas/antigua/antigua').then((c) => c.Antigua) },
  { path: 'actas/devolucion', title: 'Registrar devolución · SGTH', canActivate: [requierePermiso], data: { titulo: 'Actas', permisos: ['actas_activos.gestionar'] },
    loadComponent: () => import('./features/actas/devolucion/devolucion').then((c) => c.Devolucion) },
  { path: 'actas/:id', title: 'Acta · SGTH', canActivate: [requierePermiso], data: { titulo: 'Actas', permisos: ['actas.ver', 'actas_dotacion.gestionar', 'actas_activos.gestionar'] },
    loadComponent: () => import('./features/actas/detalle/detalle').then((c) => c.DetalleActa) },
];

// Entregas grupales de EPP
const epp: Routes = [
  { path: 'epp/planilla', title: 'Entrega grupal de EPP · SGTH', canActivate: [requierePermiso], data: { titulo: 'EPP', permisos: ['actas_epp.gestionar'] },
    loadComponent: () => import('./features/epp/planilla-nueva').then((c) => c.PlanillaNueva) },
  { path: 'epp/planillas/:id', title: 'Planilla de EPP · SGTH', canActivate: [requierePermiso], data: { titulo: 'EPP', permisos: ['inventario_epp.ver', 'inventario_epp.gestionar', 'actas_epp.gestionar'] },
    loadComponent: () => import('./features/epp/planilla-detalle').then((c) => c.PlanillaDetalle) },
];

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
      ...colaboradores,
      ...inventario,
      ...actas,
      ...epp,
      ...modulos,
    ],
  },
  { path: '**', redirectTo: '' },
];
