import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/autenticacion';
import { SesionService } from '../../../core/sesion.service';
import { ColaboradoresService, type FilaColaborador } from '../../colaboradores/colaboradores.service';
import { CONDICIONES, type Condicion, type Elemento, InventarioService } from '../../inventario/inventario.service';
import { type Acta, ActasService, hoy, type OpcionesActas, type PlantillaEntrega, TIPOS_ENTREGA } from '../actas.service';
import { SelectorColaborador } from '../selector-colaborador';

interface LineaActivo { elementoId: number | null; marca: string; modelo: string; serial: string; condicion: Condicion; descripcionAdicional: string }
interface LineaCantidad { elementoId: number | null; talla: string; cantidad: number | null }

const nuevaActivo = (): LineaActivo => ({ elementoId: null, marca: '', modelo: '', serial: '', condicion: 'BUENO', descripcionAdicional: '' });
const nuevaCantidad = (): LineaCantidad => ({ elementoId: null, talla: '', cantidad: 1 });

/** Registrar una entrega hecha antes del sistema mirando el acta escaneada. */
@Component({
  selector: 'app-antigua',
  imports: [FormsModule, RouterLink, SelectorColaborador, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule, MatSelectModule],
  templateUrl: './antigua.html',
  styleUrl: './antigua.scss',
})
export class Antigua implements OnInit, OnDestroy {
  private readonly actas = inject(ActasService);
  private readonly inventario = inject(InventarioService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly sesion = inject(SesionService);

  protected readonly tipos = TIPOS_ENTREGA.filter((t) => this.sesion.puede(t.permiso));
  protected readonly condiciones = CONDICIONES;
  protected readonly hoy = hoy();
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly opciones = signal<OpcionesActas | null>(null);
  protected readonly colaboradores = signal<FilaColaborador[]>([]);
  protected readonly catalogo = signal<Partial<Record<string, Elemento[]>>>({});

  // Documento escaneado
  protected readonly archivo = signal<File | null>(null);
  protected readonly vista = signal<{ url: string; segura: SafeResourceUrl; tipo: 'pdf' | 'imagen' } | null>(null);
  protected readonly arrastrando = signal(false);

  // Formulario
  protected readonly tipo = signal<PlantillaEntrega>(this.tipos.find((t) => t.valor === 'EQUIPOS')?.valor ?? this.tipos[0]?.valor ?? 'EQUIPOS');
  protected readonly colaboradorId = signal<number | null>(null);
  protected readonly fechaOriginal = signal('');
  protected readonly usarFechaHoy = signal(false);
  protected readonly motivo = signal('INGRESO');
  protected readonly periodoId = signal<number | null>(null);
  protected readonly ubicacion = signal('');
  protected readonly observaciones = signal('');
  protected readonly lineasActivo = signal<LineaActivo[]>([nuevaActivo()]);
  protected readonly lineasCantidad = signal<LineaCantidad[]>([nuevaCantidad()]);

  protected readonly porUnidad = computed(() => this.tipo() === 'EQUIPOS' || this.tipo() === 'MUEBLES');
  protected readonly motivos = computed(() => (this.opciones()?.motivos[this.tipo()] ?? []).filter((m) => m.valor !== 'TRASPASO'));
  protected readonly elementos = computed(() => {
    const cat = { DOTACION: 'DOTACION', EPP: 'EPP', EQUIPOS: 'EQUIPO', MUEBLES: 'MUEBLE', OTROS: 'OTRO' }[this.tipo()];
    return (this.catalogo()[cat] ?? []).filter((e) => e.activo);
  });

  async ngOnInit() {
    try {
      const [opciones, colaboradores] = await Promise.all([this.actas.opciones(), this.colaboradoresApi.listar()]);
      this.opciones.set(opciones);
      this.colaboradores.set(colaboradores);
      await this.cargarCatalogo();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el formulario'));
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
    const v = this.vista();
    if (v) URL.revokeObjectURL(v.url);
  }

  private async cargarCatalogo() {
    const cat = { DOTACION: 'DOTACION', EPP: 'EPP', EQUIPOS: 'EQUIPO', MUEBLES: 'MUEBLE', OTROS: 'OTRO' }[this.tipo()] as 'DOTACION' | 'EPP' | 'EQUIPO' | 'MUEBLE' | 'OTRO';
    if (this.catalogo()[cat]) return;
    const lista = await this.inventario.elementos(cat);
    this.catalogo.update((c) => ({ ...c, [cat]: lista }));
  }

  async cambiarTipo(t: PlantillaEntrega) {
    this.tipo.set(t);
    this.lineasActivo.set([nuevaActivo()]);
    this.lineasCantidad.set([nuevaCantidad()]);
    if (!this.motivos().some((m) => m.valor === this.motivo())) this.motivo.set(this.motivos()[0]?.valor ?? '');
    await this.cargarCatalogo();
  }

  // --- Documento ---
  elegir(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const f = campo.files?.[0];
    campo.value = '';
    if (f) this.ponerArchivo(f);
  }

  soltar(evento: DragEvent) {
    evento.preventDefault();
    this.arrastrando.set(false);
    const f = evento.dataTransfer?.files?.[0];
    if (f) this.ponerArchivo(f);
  }

  private ponerArchivo(f: File) {
    const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const esImagen = /^image\/(jpeg|png)$/.test(f.type);
    if (!esPdf && !esImagen) {
      this.error.set('El acta escaneada debe ser PDF, JPG o PNG');
      return;
    }
    const anterior = this.vista();
    if (anterior) URL.revokeObjectURL(anterior.url);
    const url = URL.createObjectURL(f);
    this.archivo.set(f);
    this.vista.set({ url, segura: this.sanitizer.bypassSecurityTrustResourceUrl(url), tipo: esPdf ? 'pdf' : 'imagen' });
    this.error.set(null);
  }

  quitarArchivo() {
    const v = this.vista();
    if (v) URL.revokeObjectURL(v.url);
    this.vista.set(null);
    this.archivo.set(null);
  }

  // --- Líneas ---
  cambiarActivo(i: number, cambio: Partial<LineaActivo>) {
    this.lineasActivo.update((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  cambiarCantidad(i: number, cambio: Partial<LineaCantidad>) {
    this.lineasCantidad.update((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  agregar() {
    if (this.porUnidad()) {
      // Lo usual es varias unidades del mismo tipo seguidas
      const anterior = this.lineasActivo().at(-1);
      this.lineasActivo.update((ls) => [...ls, { ...nuevaActivo(), elementoId: anterior?.elementoId ?? null }]);
    } else {
      this.lineasCantidad.update((ls) => [...ls, nuevaCantidad()]);
    }
  }

  quitar(i: number) {
    if (this.porUnidad()) this.lineasActivo.update((ls) => (ls.length === 1 ? [nuevaActivo()] : ls.filter((_, j) => j !== i)));
    else this.lineasCantidad.update((ls) => (ls.length === 1 ? [nuevaCantidad()] : ls.filter((_, j) => j !== i)));
  }

  manejaTallas(id: number | null) {
    return !!this.elementos().find((e) => e.id === id)?.manejaTallas;
  }

  private validar(): string | null {
    if (!this.archivo()) return 'Adjunte el acta escaneada';
    if (!this.colaboradorId()) return 'Seleccione a quién se le entregó';
    if (!this.fechaOriginal()) return 'Escriba la fecha en que se hizo la entrega (la que dice el acta)';
    if (this.fechaOriginal() > this.hoy) return 'La fecha de la entrega no puede ser posterior a hoy';
    if (!this.motivo()) return 'Seleccione el motivo';
    if (this.porUnidad()) {
      const ls = this.lineasActivo();
      const i = ls.findIndex((l) => !l.elementoId);
      if (i >= 0) return `Línea ${i + 1}: seleccione el tipo`;
    } else {
      const ls = this.lineasCantidad();
      for (const [i, l] of ls.entries()) {
        if (!l.elementoId) return `Línea ${i + 1}: seleccione el elemento`;
        if (this.manejaTallas(l.elementoId) && !l.talla.trim()) return `Línea ${i + 1}: escriba la talla`;
        if (!l.cantidad || l.cantidad < 1) return `Línea ${i + 1}: escriba la cantidad`;
      }
    }
    return null;
  }

  async guardar() {
    const problema = this.validar();
    if (problema) {
      this.error.set(problema);
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const datos = {
      plantilla: this.tipo(),
      colaboradorId: this.colaboradorId(),
      fechaOriginal: this.fechaOriginal(),
      usarFechaHoy: this.usarFechaHoy(),
      motivo: this.motivo(),
      periodoDotacionId: this.tipo() === 'DOTACION' ? this.periodoId() : null,
      ubicacion: this.tipo() === 'MUEBLES' ? this.ubicacion().trim() || null : null,
      observaciones: this.observaciones().trim() || null,
      lineas: this.porUnidad()
        ? this.lineasActivo().map((l) => ({
          nuevo: {
            elementoId: l.elementoId, condicion: l.condicion, marca: l.marca.trim() || null, modelo: l.modelo.trim() || null,
            serial: l.serial.trim() || null, descripcionAdicional: l.descripcionAdicional.trim() || null,
          },
        }))
        : this.lineasCantidad().map((l) => ({ elementoId: l.elementoId, talla: this.manejaTallas(l.elementoId) ? l.talla.trim() : null, cantidad: Number(l.cantidad) })),
    };
    try {
      const f = new FormData();
      f.append('datos', JSON.stringify(datos));
      f.append('archivo', this.archivo()!);
      const acta: Acta = await this.actas.antigua(f);
      await this.router.navigate(['/actas', acta.id], { queryParams: { nueva: 1 } });
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
