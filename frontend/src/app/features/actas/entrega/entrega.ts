import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/autenticacion';
import { SesionService } from '../../../core/sesion.service';
import { ColaboradoresService, type FilaColaborador, sinTildes } from '../../colaboradores/colaboradores.service';
import { type Activo, type Elemento, InventarioService } from '../../inventario/inventario.service';
import { ActasService, type EppColaborador, EppService, ESTADOS_EPP, hoy, type OpcionesActas, type PlantillaEntrega, type Tenencia, TIPOS_ENTREGA, tipoTallaDe } from '../actas.service';
import { SelectorColaborador } from '../selector-colaborador';

interface Linea { elementoId: number | null; talla: string; cantidad: number | null; fechaReposicion: string }

const CATEGORIA: Record<PlantillaEntrega, 'DOTACION' | 'EPP' | 'EQUIPO' | 'MUEBLE' | 'OTRO'> = {
  DOTACION: 'DOTACION', EPP: 'EPP', EQUIPOS: 'EQUIPO', MUEBLES: 'MUEBLE', OTROS: 'OTRO',
};
const lineaVacia = (): Linea => ({ elementoId: null, talla: '', cantidad: 1, fechaReposicion: '' });

/** Suma días a 'YYYY-MM-DD'. */
function sumarDias(iso: string, dias: number) {
  const f = new Date(`${iso}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Registrar una entrega o un traspaso y generar el acta. */
@Component({
  selector: 'app-entrega',
  imports: [
    DatePipe, FormsModule, RouterLink, SelectorColaborador, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule,
  ],
  templateUrl: './entrega.html',
  styleUrl: './entrega.scss',
})
export class Entrega implements OnInit {
  private readonly actas = inject(ActasService);
  private readonly eppApi = inject(EppService);
  protected readonly estadosEpp = ESTADOS_EPP;
  protected readonly estadoEpp = signal<EppColaborador | null>(null);
  private readonly inventario = inject(InventarioService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sesion = inject(SesionService);

  protected readonly tipos = TIPOS_ENTREGA.filter((t) => this.sesion.puede(t.permiso));
  protected readonly hoy = hoy();

  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly intento = signal(false);

  protected readonly opciones = signal<OpcionesActas | null>(null);
  protected readonly colaboradores = signal<FilaColaborador[]>([]);
  protected readonly activos = signal<Activo[]>([]);
  protected readonly elementosPorTipo = signal<Partial<Record<PlantillaEntrega, Elemento[]>>>({});
  protected readonly tenencia = signal<Tenencia | null>(null);

  // --- Formulario ---
  protected readonly tipo = signal<PlantillaEntrega>(this.tipos[0]?.valor ?? 'EQUIPOS');
  protected readonly colaboradorId = signal<number | null>(null);
  protected readonly traspaso = signal(false);
  protected readonly anteriorId = signal<number | null>(null);
  protected readonly fecha = signal(this.hoy);
  protected readonly motivo = signal('');
  protected readonly periodoId = signal<number | null>(null);
  protected readonly ubicacion = signal('');
  protected readonly observaciones = signal('');
  protected readonly seleccion = signal<Set<number>>(new Set());
  protected readonly busqueda = signal('');
  protected readonly lineas = signal<Linea[]>([lineaVacia()]);

  // --- Derivados ---
  protected readonly porUnidad = computed(() => this.tipo() === 'EQUIPOS' || this.tipo() === 'MUEBLES');
  protected readonly textoTipo = computed(() => TIPOS_ENTREGA.find((t) => t.valor === this.tipo())!);
  protected readonly colaborador = computed(() => this.colaboradores().find((c) => c.id === this.colaboradorId()) ?? null);
  protected readonly anterior = computed(() => this.colaboradores().find((c) => c.id === this.anteriorId()) ?? null);
  protected readonly motivos = computed(() => (this.opciones()?.motivos[this.tipo()] ?? []).filter((m) => m.valor !== 'TRASPASO'));
  protected readonly periodos = computed(() => this.opciones()?.periodos ?? []);
  protected readonly elementos = computed(() => (this.elementosPorTipo()[this.tipo()] ?? []).filter((e) => e.activo));

  /** Activos que se pueden escoger: disponibles, o los que tiene el colaborador anterior en un traspaso. */
  protected readonly candidatos = computed(() => {
    const cat = CATEGORIA[this.tipo()];
    const t = sinTildes(this.busqueda().trim());
    return this.activos()
      .filter((a) => a.categoria === cat)
      .filter((a) => (this.traspaso() ? a.estado === 'ASIGNADO' && a.colaboradorId === this.anteriorId() : a.estado === 'DISPONIBLE'))
      .filter((a) => !t || sinTildes(`${a.placa} ${a.elemento} ${a.serial ?? ''} ${a.marca ?? ''} ${a.modelo ?? ''}`).includes(t));
  });
  protected readonly elegidos = computed(() => this.activos().filter((a) => this.seleccion().has(a.id)));

  /** Líneas por cantidad con sus datos de stock, para validar y para el resumen. */
  protected readonly lineasDetalle = computed(() => this.lineas().map((l) => {
    const e = this.elementos().find((x) => x.id === l.elementoId) ?? null;
    const talla = e?.manejaTallas ? l.talla : 'UNICA';
    const hay = e ? (e.existencias.find((x) => x.talla === talla)?.cantidad ?? 0) : 0;
    const repetida = !!e && this.lineas().filter((o) => o.elementoId === l.elementoId && (e.manejaTallas ? o.talla === l.talla : true)).length > 1;
    const reposicionCalculada = e?.vidaUtilDias && this.fecha() ? sumarDias(this.fecha(), e.vidaUtilDias) : '';
    return { ...l, elemento: e, hay, repetida, sugerida: e ? this.tallaSugerida(e) : null, reposicionCalculada, reposicion: l.fechaReposicion || reposicionCalculada };
  }));

  protected readonly dotacionDelPeriodo = computed(() => {
    const p = this.periodoId();
    return p ? this.tenencia()?.dotacion.find((d) => d.periodoId === p) ?? null : null;
  });

  protected readonly problemas = computed(() => {
    const p: string[] = [];
    if (!this.colaboradorId()) p.push('Seleccione quién recibe');
    if (this.traspaso() && !this.anteriorId()) p.push('Seleccione de quién viene el traspaso');
    if (!this.traspaso() && !this.motivo()) p.push('Seleccione el motivo');
    if (this.tipo() === 'DOTACION' && this.motivo() === 'DOTACION_PERIODICA' && !this.periodoId()) p.push('Seleccione el período de dotación');
    if (!this.fecha() || this.fecha() > this.hoy) p.push('La fecha no puede ser posterior a hoy');
    if (this.porUnidad()) {
      if (!this.elegidos().length) p.push(`Marque al menos un ${this.tipo() === 'EQUIPOS' ? 'equipo' : 'mueble'}`);
    } else {
      const ls = this.lineasDetalle();
      if (!ls.some((l) => l.elemento)) p.push('Agregue al menos un elemento');
      ls.forEach((l, i) => {
        if (!l.elemento) return;
        if (l.elemento.manejaTallas && !l.talla) p.push(`Línea ${i + 1}: escoja la talla`);
        else if (!l.cantidad || l.cantidad < 1) p.push(`Línea ${i + 1}: escriba la cantidad`);
        else if (l.cantidad > l.hay) p.push(`Línea ${i + 1}: solo hay ${l.hay} en bodega`);
        if (l.repetida) p.push(`Línea ${i + 1}: está repetida`);
        if (this.tipo() === 'EPP' && l.reposicion && l.reposicion <= this.fecha()) p.push(`Línea ${i + 1}: la reposición debe ser posterior a la entrega`);
      });
    }
    return p;
  });

  constructor() {
    // Al cambiar de colaborador se cargan sus tallas y su dotación recibida
    effect(() => {
      const id = this.colaboradorId();
      untracked(() => this.cargarTenencia(id));
    });
  }

  async ngOnInit() {
    const q = this.ruta.snapshot.queryParamMap;
    const tipo = q.get('tipo') as PlantillaEntrega | null;
    if (tipo && this.tipos.some((t) => t.valor === tipo)) this.tipo.set(tipo);
    try {
      const [opciones, colaboradores, activos] = await Promise.all([
        this.actas.opciones(),
        this.colaboradoresApi.listar(),
        this.porUnidadPosible() ? this.inventario.activos() : Promise.resolve([] as Activo[]),
      ]);
      this.opciones.set(opciones);
      this.colaboradores.set(colaboradores.filter((c) => c.estado === 'ACTIVO'));
      this.activos.set(activos);
      this.periodoId.set(opciones.actual);
      this.aplicarTipo();
      await this.cargarElementos();
      // Atajos desde otras pantallas
      const colaborador = Number(q.get('colaborador'));
      if (colaborador) this.colaboradorId.set(colaborador);
      const anterior = Number(q.get('anterior'));
      if (anterior) {
        this.traspaso.set(true);
        this.anteriorId.set(anterior);
      }
      const activo = Number(q.get('activo'));
      if (activo) this.seleccion.set(new Set([activo]));
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el formulario'));
    } finally {
      this.cargando.set(false);
    }
  }

  private porUnidadPosible() {
    return this.tipos.some((t) => t.valor === 'EQUIPOS' || t.valor === 'MUEBLES');
  }

  async cambiarTipo(t: PlantillaEntrega) {
    this.tipo.set(t);
    this.seleccion.set(new Set());
    this.lineas.set([lineaVacia()]);
    this.busqueda.set('');
    if (!this.porUnidad()) this.traspaso.set(false);
    this.aplicarTipo();
    await this.cargarElementos();
  }

  /** Motivo por defecto según el tipo. */
  private aplicarTipo() {
    const preferido = this.tipo() === 'DOTACION' ? 'DOTACION_PERIODICA' : this.tipo() === 'EPP' ? 'INGRESO' : 'ASIGNACION';
    this.motivo.set(this.motivos().some((m) => m.valor === preferido) ? preferido : (this.motivos()[0]?.valor ?? ''));
  }

  private async cargarElementos() {
    const t = this.tipo();
    if (this.porUnidad() || this.elementosPorTipo()[t]) return;
    const lista = await this.inventario.elementos(CATEGORIA[t] as 'DOTACION' | 'EPP' | 'OTRO');
    this.elementosPorTipo.update((m) => ({ ...m, [t]: lista }));
  }

  private async cargarTenencia(id: number | null) {
    this.tenencia.set(null);
    this.estadoEpp.set(null);
    if (!id) return;
    try {
      const [t, epp] = await Promise.all([
        this.actas.tenencia(id),
        this.tipos.some((x) => x.valor === 'EPP') ? this.eppApi.estado(id) : Promise.resolve(null),
      ]);
      this.tenencia.set(t);
      this.estadoEpp.set(epp);
    } catch {
      // Solo es información de apoyo
    }
  }

  /** EPP del cargo que faltan, están vencidos o por vencer: se agregan como líneas con la talla de la ficha. */
  protected readonly eppPendientes = computed(() => (this.estadoEpp()?.epp ?? []).filter((e) => e.requerido && e.estado !== 'VIGENTE'));

  agregarPendientes() {
    const nuevas: Linea[] = [];
    for (const p of this.eppPendientes()) {
      const e = this.elementos().find((x) => x.id === p.elementoId);
      if (!e || this.lineas().some((l) => l.elementoId === e.id)) continue;
      const sugerida = this.tallaSugerida(e) ?? p.talla ?? '';
      const talla = e.manejaTallas && e.existencias.some((x) => x.talla === sugerida && x.cantidad > 0) ? sugerida : '';
      nuevas.push({ elementoId: e.id, talla, cantidad: p.cantidadRequerida || 1, fechaReposicion: '' });
    }
    if (!nuevas.length) return;
    this.lineas.update((ls) => [...ls.filter((l) => l.elementoId), ...nuevas]);
    if (this.eppPendientes().every((p) => p.estado === 'SIN_ENTREGAR')) this.motivo.set('INGRESO');
    else if (this.motivos().some((m) => m.valor === 'REPOSICION_VIDA_UTIL')) this.motivo.set('REPOSICION_VIDA_UTIL');
  }

  cambiarTraspaso(v: boolean) {
    this.traspaso.set(v);
    this.seleccion.set(new Set());
    if (!v) this.anteriorId.set(null);
  }

  cambiarAnterior(id: number | null) {
    this.anteriorId.set(id);
    // En un traspaso lo normal es pasar todo lo que tenía: se marcan sus activos de este tipo
    this.seleccion.set(new Set(this.candidatos().map((a) => a.id)));
  }

  marcar(a: Activo, v: boolean) {
    const s = new Set(this.seleccion());
    if (v) s.add(a.id);
    else s.delete(a.id);
    this.seleccion.set(s);
  }

  // --- Líneas por cantidad ---
  cambiarLinea(i: number, cambio: Partial<Linea>) {
    this.lineas.update((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      const nueva = { ...l, ...cambio };
      // Al escoger el elemento, se propone la talla registrada del colaborador si hay stock
      if (cambio.elementoId !== undefined) {
        const e = this.elementos().find((x) => x.id === cambio.elementoId);
        const sugerida = e ? this.tallaSugerida(e) : null;
        nueva.talla = sugerida && e!.existencias.some((x) => x.talla === sugerida && x.cantidad > 0) ? sugerida : '';
      }
      return nueva;
    }));
  }

  agregarLinea() {
    this.lineas.update((ls) => [...ls, lineaVacia()]);
  }

  quitarLinea(i: number) {
    this.lineas.update((ls) => (ls.length === 1 ? [lineaVacia()] : ls.filter((_, j) => j !== i)));
  }

  /** Talla registrada en la ficha del colaborador para ese tipo de prenda. */
  tallaSugerida(e: Elemento): string | null {
    const tipo = tipoTallaDe(`${e.subcategoria ?? ''} ${e.nombre}`);
    return tipo ? (this.tenencia()?.tallas.find((t) => t.tipo === tipo)?.talla ?? null) : null;
  }

  nombreTalla(tipo: string) {
    return ({ CAMISA: 'Camisa', PANTALON: 'Pantalón', CALZADO: 'Calzado', GUANTES: 'Guantes', OVEROL: 'Overol' } as Record<string, string>)[tipo] ?? tipo;
  }

  async guardar() {
    this.intento.set(true);
    if (this.problemas().length) {
      this.error.set(this.problemas()[0]);
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      const acta = await this.actas.entregar({
        plantilla: this.tipo(),
        colaboradorId: this.colaboradorId()!,
        fecha: this.fecha(),
        motivo: this.traspaso() ? 'TRASPASO' : this.motivo(),
        periodoDotacionId: this.tipo() === 'DOTACION' ? this.periodoId() : null,
        ubicacion: this.tipo() === 'MUEBLES' ? this.ubicacion().trim() || null : null,
        colaboradorAnteriorId: this.traspaso() ? this.anteriorId() : null,
        observaciones: this.observaciones().trim() || null,
        lineas: this.porUnidad()
          ? this.elegidos().map((a) => ({ activoId: a.id }))
          : this.lineasDetalle().filter((l) => l.elemento).map((l) => ({
            elementoId: l.elementoId!, talla: l.elemento!.manejaTallas ? l.talla : null, cantidad: Number(l.cantidad),
            // Solo se envía si se cambió a mano; si no, el sistema la calcula con la vida útil
            fechaReposicion: this.tipo() === 'EPP' && l.fechaReposicion && l.fechaReposicion !== l.reposicionCalculada ? l.fechaReposicion : null,
          })),
      });
      await this.router.navigate(['/actas', acta.id], { queryParams: { nueva: 1 } });
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
