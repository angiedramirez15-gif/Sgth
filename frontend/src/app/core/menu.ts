/** Opciones del menú principal. Cada opción se muestra solo si el rol tiene alguno de sus permisos. */
export interface OpcionMenu {
  ruta: string;
  titulo: string;
  icono: string; // nombre del ícono de Material Symbols
  descripcion: string;
  permisos: string[];
  fase?: number; // fase del plan en que se construye (sección 13)
  disponible?: boolean; // true cuando el módulo ya está construido
}

export const MENU_PRINCIPAL: OpcionMenu[] = [
  { ruta: 'colaboradores', titulo: 'Colaboradores', icono: 'badge', descripcion: 'Fichas, datos laborales y expediente de documentos.', permisos: ['colaboradores.ver'], fase: 3, disponible: true },
  { ruta: 'dotacion', titulo: 'Dotación', icono: 'apparel', descripcion: 'Inventario de uniformes y calzado, y entregas por período.', permisos: ['inventario_dotacion.ver', 'actas_dotacion.gestionar'], fase: 4, disponible: true },
  { ruta: 'epp', titulo: 'EPP', icono: 'health_and_safety', descripcion: 'Elementos de protección personal, matriz por cargo y reposiciones.', permisos: ['inventario_epp.ver', 'actas_epp.gestionar'], fase: 5 },
  { ruta: 'equipos', titulo: 'Equipos y muebles', icono: 'devices', descripcion: 'Computadores, celulares, herramientas y muebles asignados.', permisos: ['inventario_activos.ver', 'actas_activos.gestionar'], fase: 4, disponible: true },
  { ruta: 'actas', titulo: 'Actas', icono: 'contract', descripcion: 'Actas de entrega y devolución, y carga del acta firmada.', permisos: ['actas.ver'], fase: 4, disponible: true },
  { ruta: 'alertas', titulo: 'Alertas', icono: 'notifications', descripcion: 'Documentos por vencer, reposición de EPP y dotación pendiente.', permisos: ['alertas_th.ver', 'alertas_sst.ver'], fase: 6 },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'table_chart', descripcion: 'Listados exportables a Excel.', permisos: ['reportes.ver'], fase: 6 },
];

export const MENU_ADMINISTRACION: OpcionMenu[] = [
  { ruta: 'administracion/usuarios', titulo: 'Usuarios', icono: 'manage_accounts', descripcion: 'Usuarios del sistema y sus roles.', permisos: ['usuarios.gestionar'], fase: 2, disponible: true },
  { ruta: 'administracion/catalogos', titulo: 'Catálogos', icono: 'list_alt', descripcion: 'Áreas, cargos, tipos de documento, entidades y proveedores.', permisos: ['catalogos.gestionar'], fase: 2, disponible: true },
  { ruta: 'administracion/plantillas', titulo: 'Plantillas de actas', icono: 'edit_document', descripcion: 'Textos y cláusulas de cada tipo de acta.', permisos: ['plantillas.gestionar'], fase: 4 },
  { ruta: 'administracion/configuracion', titulo: 'Configuración', icono: 'tune', descripcion: 'Salario mínimo, días de alerta y otros parámetros.', permisos: ['configuracion.gestionar'], fase: 2, disponible: true },
];
