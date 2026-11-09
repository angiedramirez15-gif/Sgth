import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Opcion { valor: string; etiqueta: string }

export interface OpcionesColaborador {
  tiposDocumento: { id: number; codigo: string; nombre: string }[];
  areas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string; areaId: number | null; nivelRiesgoArl: number | null }[];
  entidades: { id: number; tipo: string; nombre: string }[];
  jefes: { id: number; nombre: string; cargo: string }[];
  listas: Record<'sexo' | 'tipoSangre' | 'estadoCivil' | 'nivelEducativo' | 'tipoContrato' | 'tipoCuenta' | 'derechoDotacion' | 'tipoTalla', Opcion[]>;
}

export interface FilaColaborador {
  id: number;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  area: string;
  fechaIngreso: string;
  tipoContrato: string;
  fechaFinContrato: string | null;
  estado: 'ACTIVO' | 'RETIRADO';
  tieneFoto: boolean;
  documentosFaltantes: number;
  documentosVencidos: number;
}

/** Campos editables de la ficha (los mismos que acepta el backend). */
export interface DatosColaborador {
  tipoDocumentoId: number | null;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  sexo: string;
  fechaNacimiento: string | null;
  tipoSangre?: string | null;
  estadoCivil: string | null;
  numeroHijos: number | null;
  personasACargo: number | null;
  nivelEducativo: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  ciudadResidencia: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaTelefono: string | null;
  cargoId: number | null;
  areaId: number | null;
  jefeId: number | null;
  fechaIngreso: string;
  tipoContrato: string;
  fechaFinContrato: string | null;
  salario?: number | null;
  derechoDotacion: string;
  epsId: number | null;
  afpId: number | null;
  arlId: number | null;
  ccfId: number | null;
  cesantiasId: number | null;
  nivelRiesgoArl: number | null;
  banco?: string | null;
  tipoCuenta?: string | null;
  numeroCuenta?: string | null;
  tallas: Record<string, string | null>;
}

export interface FichaColaborador extends DatosColaborador {
  id: number;
  tipoDocumentoCodigo: string;
  tipoDocumentoNombre: string;
  cargoNombre: string;
  areaNombre: string;
  jefeNombre: string | null;
  epsNombre: string | null;
  afpNombre: string | null;
  arlNombre: string | null;
  ccfNombre: string | null;
  cesantiasNombre: string | null;
  estado: 'ACTIVO' | 'RETIRADO';
  fechaRetiro: string | null;
  motivoRetiro: string | null;
  tieneFoto: boolean;
  creadoEn: string;
  actualizadoEn: string | null;
  permisos: { verSensibles: boolean; verSalud: boolean };
}

export interface Documento {
  id: number;
  tipoDocumentoId: number;
  tipoDocumento: string;
  esSensible: boolean;
  manejaVencimiento: boolean;
  descripcion: string | null;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  fechaExpedicion: string | null;
  fechaVencimiento: string | null;
  version: number;
  reemplazaAId: number | null;
  vigente: boolean;
  creadoEn: string;
  creadoPor: string | null;
  estadoVencimiento: 'SIN_VENCIMIENTO' | 'AL_DIA' | 'POR_VENCER' | 'VENCIDO';
  diasParaVencer: number | null;
}

export interface Expediente {
  documentos: Documento[];
  faltantes: { id: number; nombre: string }[];
  tipos: { id: number; nombre: string; manejaVencimiento: boolean; esSensible: boolean }[];
  maxMb: number;
}

export interface ResultadoImportacion {
  total: number;
  validas: number;
  errores: { fila: number; documento: string; nombre: string; errores: string[] }[];
  vistaPrevia: { fila: number; documento: string; nombre: string }[];
  creados: number;
  faltantes?: { lista: string; valores: string[] }[];
}

@Injectable({ providedIn: 'root' })
export class ColaboradoresService {
  private readonly http = inject(HttpClient);

  listar = () => firstValueFrom(this.http.get<FilaColaborador[]>('/api/colaboradores'));
  opciones = () => firstValueFrom(this.http.get<OpcionesColaborador>('/api/colaboradores/opciones'));
  obtener = (id: number) => firstValueFrom(this.http.get<FichaColaborador>(`/api/colaboradores/${id}`));
  crear = (d: DatosColaborador) => firstValueFrom(this.http.post<FichaColaborador>('/api/colaboradores', d));
  editar = (id: number, d: DatosColaborador) => firstValueFrom(this.http.put<FichaColaborador>(`/api/colaboradores/${id}`, d));
  retirar = (id: number, fechaRetiro: string, motivoRetiro: string) =>
    firstValueFrom(this.http.post<{ ficha: FichaColaborador; elementosSinDevolver: number }>(`/api/colaboradores/${id}/retiro`, { fechaRetiro, motivoRetiro }));
  reactivar = (id: number) => firstValueFrom(this.http.post<FichaColaborador>(`/api/colaboradores/${id}/reactivar`, {}));

  subirFoto(id: number, archivo: File) {
    const f = new FormData();
    f.append('archivo', archivo);
    return firstValueFrom(this.http.post(`/api/colaboradores/${id}/foto`, f));
  }

  /** Las imágenes necesitan el token, así que se descargan y se muestran como URL local. */
  async fotoUrl(id: number): Promise<string | null> {
    try {
      const blob = await firstValueFrom(this.http.get(`/api/colaboradores/${id}/foto`, { responseType: 'blob' }));
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  expediente = (id: number) => firstValueFrom(this.http.get<Expediente>(`/api/colaboradores/${id}/documentos`));

  subirDocumento(id: number, archivo: File, datos: Record<string, string | number | null>) {
    const f = new FormData();
    f.append('archivo', archivo);
    for (const [k, v] of Object.entries(datos)) if (v !== null && v !== '') f.append(k, String(v));
    return firstValueFrom(this.http.post<{ id: number }>(`/api/colaboradores/${id}/documentos`, f));
  }

  inactivarDocumento = (id: number) => firstValueFrom(this.http.patch(`/api/documentos/${id}/inactivar`, {}));

  archivoDocumento = (id: number) => firstValueFrom(this.http.get(`/api/documentos/${id}/archivo`, { responseType: 'blob' }));

  plantilla = () => firstValueFrom(this.http.get('/api/colaboradores/importacion/plantilla', { responseType: 'blob' }));

  importar(archivo: File, confirmar: boolean) {
    const f = new FormData();
    f.append('archivo', archivo);
    return firstValueFrom(this.http.post<ResultadoImportacion>(`/api/colaboradores/importacion?confirmar=${confirmar}`, f));
  }

  obligatorios = (cargoId: number) => firstValueFrom(this.http.get<number[]>(`/api/cargos/${cargoId}/documentos-obligatorios`));
  guardarObligatorios = (cargoId: number, tipos: number[]) =>
    firstValueFrom(this.http.put<number[]>(`/api/cargos/${cargoId}/documentos-obligatorios`, { tipos }));
}

/** Guarda un archivo descargado con su nombre. */
export function guardarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function etiqueta(lista: Opcion[] | undefined, valor: string | null | undefined): string {
  return lista?.find((o) => o.valor === valor)?.etiqueta ?? valor ?? '';
}

export function sinTildes(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
