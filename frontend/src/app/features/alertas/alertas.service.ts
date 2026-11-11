import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../core/sesion.service';

export type TipoAlerta =
  | 'DOCUMENTO_VENCIDO' | 'DOCUMENTO_POR_VENCER' | 'CONTRATO_POR_VENCER' | 'EPP_REPOSICION'
  | 'DOTACION_PENDIENTE' | 'ACTA_SIN_FIRMAR' | 'ELEMENTOS_SIN_DEVOLVER' | 'AUTORIZACION_DATOS';

export interface Alerta {
  id: number;
  tipo: TipoAlerta;
  colaboradorId: number | null;
  colaborador: string | null;
  cargo: string | null;
  referenciaTabla: string;
  referenciaId: number;
  fechaEvento: string;
  mensaje: string;
  estado: 'ACTIVA' | 'DESCARTADA' | 'ATENDIDA';
  atendidaEn: string | null;
  atendidaPor: string | null;
  motivo: string | null;
  dias: number;
}

export interface ResumenAlertas {
  tipos: { tipo: TipoAlerta; total: number; vencidas: number }[];
  total: number;
  avisos: string[];
}

/** Textos y acción de cada tipo de alerta, en el orden en que se muestran. */
export const TIPOS: Record<TipoAlerta, { titulo: string; icono: string; accion: string }> = {
  DOCUMENTO_VENCIDO: { titulo: 'Documentos vencidos', icono: 'event_busy', accion: 'Ver documentos' },
  DOCUMENTO_POR_VENCER: { titulo: 'Documentos por vencer', icono: 'event_upcoming', accion: 'Ver documentos' },
  CONTRATO_POR_VENCER: { titulo: 'Contratos por terminar', icono: 'contract', accion: 'Ver colaborador' },
  EPP_REPOSICION: { titulo: 'EPP por reponer', icono: 'health_and_safety', accion: 'Entregar EPP' },
  DOTACION_PENDIENTE: { titulo: 'Dotación pendiente', icono: 'apparel', accion: 'Entregar dotación' },
  ACTA_SIN_FIRMAR: { titulo: 'Actas sin la firmada', icono: 'draft', accion: 'Ver acta' },
  ELEMENTOS_SIN_DEVOLVER: { titulo: 'Retirados con elementos', icono: 'assignment_return', accion: 'Registrar devolución' },
  AUTORIZACION_DATOS: { titulo: 'Sin autorización de datos', icono: 'privacy_tip', accion: 'Cargar autorización' },
};
export const ORDEN_TIPOS = Object.keys(TIPOS) as TipoAlerta[];

/** A dónde lleva el botón de cada alerta. */
export function destino(a: Pick<Alerta, 'tipo' | 'colaboradorId' | 'referenciaId'>): { ruta: unknown[]; query?: Record<string, unknown> } {
  switch (a.tipo) {
    case 'DOCUMENTO_VENCIDO':
    case 'DOCUMENTO_POR_VENCER':
      return { ruta: ['/colaboradores', a.colaboradorId], query: { pestana: 'documentos' } };
    case 'EPP_REPOSICION':
      return { ruta: ['/actas/entrega'], query: { tipo: 'EPP', colaborador: a.colaboradorId } };
    case 'DOTACION_PENDIENTE':
      return { ruta: ['/actas/entrega'], query: { tipo: 'DOTACION', colaborador: a.colaboradorId } };
    case 'ACTA_SIN_FIRMAR':
      return { ruta: ['/actas', a.referenciaId] };
    case 'AUTORIZACION_DATOS':
      return { ruta: ['/colaboradores', a.colaboradorId], query: { pestana: 'documentos' } };
    case 'ELEMENTOS_SIN_DEVOLVER':
      return { ruta: ['/actas/devolucion'], query: { colaborador: a.colaboradorId } };
    default:
      return { ruta: ['/colaboradores', a.colaboradorId] };
  }
}

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SesionService);
  /** Resumen compartido: lo usan el menú (contador) y el inicio. */
  readonly resumen = signal<ResumenAlertas | null>(null);
  private ultima = 0;

  puedeVer() {
    return this.sesion.puede('alertas_th.ver', 'alertas_sst.ver');
  }

  async refrescar(forzar = false) {
    if (!this.puedeVer() || (!forzar && Date.now() - this.ultima < 60_000)) return this.resumen();
    this.ultima = Date.now();
    try {
      this.resumen.set(await firstValueFrom(this.http.get<ResumenAlertas>('/api/alertas/resumen')));
    } catch {
      // el contador simplemente no se actualiza
    }
    return this.resumen();
  }

  listar = (estado: 'ACTIVA' | 'DESCARTADA' | 'ATENDIDA' = 'ACTIVA') =>
    firstValueFrom(this.http.get<Alerta[]>('/api/alertas', { params: { estado } }));
  actualizar = async () => {
    const r = await firstValueFrom(this.http.post<ResumenAlertas>('/api/alertas/actualizar', {}));
    this.resumen.set(r);
    this.ultima = Date.now();
    return r;
  };
  descartar = (id: number, motivo: string) => firstValueFrom(this.http.post(`/api/alertas/${id}/descartar`, { motivo }));
  reactivar = (id: number) => firstValueFrom(this.http.post(`/api/alertas/${id}/reactivar`, {}));
}
