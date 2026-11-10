import { TextFieldModule } from '@angular/cdk/text-field';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { mensajeDeError } from '../../../core/autenticacion';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { abrirPdf } from '../../inventario/inventario.service';

type Tipo = 'DOTACION' | 'EPP' | 'EQUIPOS' | 'MUEBLES' | 'OTROS' | 'DEVOLUCION';

interface Resumen { plantilla: Tipo; nombre: string; version: number | null; actualizada: string | null; actualizadaPor: string | null; versiones: number; actas: number }
interface Campo { campo: string; descripcion: string; ejemplo: string }
interface Detalle {
  id: number; plantilla: Tipo; nombre: string; version: number; vigente: boolean; titulo: string; textoIntroduccion: string;
  textoManifiesta: string; clausulas: string[]; creadoEn: string; creadoPor: string | null; campos: Campo[];
}
interface Version { id: number; version: number; vigente: boolean; creadoEn: string; creadoPor: string | null; actas: number }
interface Textos { titulo: string; textoIntroduccion: string; textoManifiesta: string; clausulas: string[] }

/** Editar los textos de cada tipo de acta. Guardar crea una versión nueva; las actas ya hechas no cambian. */
@Component({
  selector: 'app-plantillas',
  imports: [DatePipe, FormsModule, TextFieldModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './plantillas.html',
  styleUrl: './plantillas.scss',
})
export class Plantillas implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);
  protected readonly puedeEditar = inject(SesionService).puede('plantillas.gestionar');

  protected readonly resumen = signal<Resumen[]>([]);
  protected readonly actual = signal<Detalle | null>(null);
  protected readonly versiones = signal<Version[]>([]);
  protected readonly textos = signal<Textos | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly generando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Campo de texto donde se insertan los {{CAMPOS}}: 'titulo', 'intro', 'manifiesta' o el índice de la cláusula. */
  private enfoque: { clave: string; elemento: HTMLInputElement | HTMLTextAreaElement } | null = null;

  protected readonly cambios = computed(() => {
    const a = this.actual();
    const t = this.textos();
    if (!a || !t) return false;
    return a.titulo !== t.titulo || a.textoIntroduccion !== t.textoIntroduccion || a.textoManifiesta !== t.textoManifiesta
      || JSON.stringify(a.clausulas) !== JSON.stringify(t.clausulas.map((c) => c.trim()).filter(Boolean));
  });
  protected readonly siguienteVersion = computed(() => (this.versiones()[0]?.version ?? 0) + 1);

  async ngOnInit() {
    try {
      this.resumen.set(await firstValueFrom(this.http.get<Resumen[]>('/api/plantillas')));
      await this.abrir(this.resumen()[0].plantilla);
    } catch (e) {
      this.avisos.error(e, 'No se pudieron cargar las plantillas');
    } finally {
      this.cargando.set(false);
    }
  }

  async elegir(tipo: Tipo) {
    if (tipo === this.actual()?.plantilla) return;
    if (this.cambios()) {
      const ok = await this.avisos.confirmar({
        titulo: 'Descartar cambios',
        mensaje: `Tiene cambios sin guardar en ${this.actual()!.nombre}. Si cambia de plantilla se pierden.`,
        accion: 'Descartar',
        peligro: true,
      });
      if (!ok) return;
    }
    await this.abrir(tipo);
  }

  private async abrir(tipo: Tipo, versionId?: number) {
    this.error.set(null);
    const params: Record<string, string> = versionId ? { version: String(versionId) } : {};
    const [d, v] = await Promise.all([
      firstValueFrom(this.http.get<Detalle>(`/api/plantillas/${tipo}`, { params })),
      firstValueFrom(this.http.get<Version[]>(`/api/plantillas/${tipo}/versiones`)),
    ]);
    if (versionId) {
      // Restaurar: se cargan los textos viejos para guardarlos como versión nueva; la referencia sigue siendo la vigente
      const vigente = await firstValueFrom(this.http.get<Detalle>(`/api/plantillas/${tipo}`));
      this.actual.set(vigente);
    } else {
      this.actual.set(d);
    }
    this.versiones.set(v);
    this.textos.set({ titulo: d.titulo, textoIntroduccion: d.textoIntroduccion, textoManifiesta: d.textoManifiesta, clausulas: [...d.clausulas] });
  }

  async restaurar(v: Version) {
    if (this.cambios()) {
      const ok = await this.avisos.confirmar({ titulo: 'Cargar otra versión', mensaje: 'Se reemplazan los cambios que no ha guardado.', accion: 'Cargar', peligro: true });
      if (!ok) return;
    }
    await this.abrir(this.actual()!.plantilla, v.id);
    this.avisos.exito(`Textos de la versión ${v.version} cargados. Revíselos y guárdelos para volver a usarlos.`);
  }

  descartar() {
    const a = this.actual()!;
    this.textos.set({ titulo: a.titulo, textoIntroduccion: a.textoIntroduccion, textoManifiesta: a.textoManifiesta, clausulas: [...a.clausulas] });
    this.error.set(null);
  }

  // --- Edición ---
  cambiar(cambio: Partial<Textos>) {
    this.textos.update((t) => ({ ...t!, ...cambio }));
  }

  cambiarClausula(i: number, valor: string) {
    this.textos.update((t) => ({ ...t!, clausulas: t!.clausulas.map((c, j) => (j === i ? valor : c)) }));
  }

  agregarClausula() {
    this.textos.update((t) => ({ ...t!, clausulas: [...t!.clausulas, ''] }));
    setTimeout(() => document.querySelector<HTMLTextAreaElement>(`#clausula-${this.textos()!.clausulas.length - 1}`)?.focus());
  }

  async quitarClausula(i: number) {
    const texto = this.textos()!.clausulas[i];
    if (texto.trim()) {
      const ok = await this.avisos.confirmar({ titulo: `Quitar la cláusula ${i + 1}`, mensaje: texto.slice(0, 180) + (texto.length > 180 ? '…' : ''), accion: 'Quitar', peligro: true });
      if (!ok) return;
    }
    this.textos.update((t) => ({ ...t!, clausulas: t!.clausulas.filter((_, j) => j !== i) }));
  }

  mover(i: number, paso: -1 | 1) {
    this.textos.update((t) => {
      const c = [...t!.clausulas];
      [c[i], c[i + paso]] = [c[i + paso], c[i]];
      return { ...t!, clausulas: c };
    });
  }

  enfocar(clave: string, evento: FocusEvent) {
    this.enfoque = { clave, elemento: evento.target as HTMLInputElement | HTMLTextAreaElement };
  }

  /** Inserta {{CAMPO}} donde estaba el cursor. */
  insertar(campo: string) {
    if (!this.enfoque) {
      this.avisos.error(null, 'Primero haga clic en el texto donde quiere poner el campo');
      return;
    }
    const { clave, elemento } = this.enfoque;
    const marca = `{{${campo}}}`;
    const inicio = elemento.selectionStart ?? elemento.value.length;
    const fin = elemento.selectionEnd ?? inicio;
    const nuevo = elemento.value.slice(0, inicio) + marca + elemento.value.slice(fin);
    if (clave === 'titulo') this.cambiar({ titulo: nuevo });
    else if (clave === 'intro') this.cambiar({ textoIntroduccion: nuevo });
    else if (clave === 'manifiesta') this.cambiar({ textoManifiesta: nuevo });
    else this.cambiarClausula(Number(clave), nuevo);
    setTimeout(() => {
      elemento.focus();
      elemento.setSelectionRange(inicio + marca.length, inicio + marca.length);
    });
  }

  private cuerpo(): Textos {
    const t = this.textos()!;
    return { ...t, clausulas: t.clausulas.map((c) => c.trim()).filter(Boolean) };
  }

  async vistaPrevia() {
    this.generando.set(true);
    this.error.set(null);
    try {
      await abrirPdf(
        () => firstValueFrom(this.http.post(`/api/plantillas/${this.actual()!.plantilla}/vista-previa`, this.cuerpo(), { responseType: 'blob' })),
        'Vista_previa_acta.pdf',
      );
    } catch (e) {
      this.error.set(await mensajeDeErrorBlob(e));
    } finally {
      this.generando.set(false);
    }
  }

  async guardar() {
    const a = this.actual()!;
    const ok = await this.avisos.confirmar({
      titulo: `Guardar la versión ${this.siguienteVersion()} de ${a.nombre}`,
      mensaje: 'Las actas nuevas saldrán con estos textos. Las que ya se generaron conservan el texto con el que se hicieron.',
      accion: 'Guardar versión',
    });
    if (!ok) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const d = await firstValueFrom(this.http.post<Detalle>(`/api/plantillas/${a.plantilla}`, this.cuerpo()));
      this.avisos.exito(`Versión ${d.version} guardada`);
      this.resumen.set(await firstValueFrom(this.http.get<Resumen[]>('/api/plantillas')));
      await this.abrir(a.plantilla);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}

/** Las respuestas en PDF traen el error como Blob: se lee el JSON para mostrar el mensaje real. */
export async function mensajeDeErrorBlob(e: unknown): Promise<string> {
  const cuerpo = (e as { error?: unknown }).error;
  if (cuerpo instanceof Blob) {
    try {
      const j = JSON.parse(await cuerpo.text());
      return Array.isArray(j.message) ? j.message.join('. ') : (j.message ?? 'No se pudo generar el PDF');
    } catch {
      // sigue abajo
    }
  }
  return mensajeDeError(e, 'No se pudo generar el PDF');
}
