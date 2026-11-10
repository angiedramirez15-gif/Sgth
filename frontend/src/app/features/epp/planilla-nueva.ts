import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { ColaboradoresService, type FilaColaborador } from '../colaboradores/colaboradores.service';
import { ActasService, EppService, hoy, tipoTallaDe } from '../actas/actas.service';
import { SelectorColaborador } from '../actas/selector-colaborador';
import { type Elemento, InventarioService } from '../inventario/inventario.service';

interface Columna { elementoId: number; cantidad: number }
interface Persona { colaboradorId: number; nombre: string; cargo: string; tallas: Record<string, string>; celdas: Record<number, { incluir: boolean; talla: string }> }

const MOTIVOS = [
  { valor: 'INGRESO', etiqueta: 'Ingreso a la empresa' },
  { valor: 'REPOSICION_VIDA_UTIL', etiqueta: 'Reposición por vida útil' },
  { valor: 'DANO', etiqueta: 'Reposición por daño' },
  { valor: 'PERDIDA', etiqueta: 'Reposición por pérdida' },
  { valor: 'CAMBIO_CARGO', etiqueta: 'Cambio de cargo' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/** Entrega grupal de EPP: personas en filas, EPP en columnas; una sola planilla para firmar. */
@Component({
  selector: 'app-planilla-nueva',
  imports: [FormsModule, RouterLink, SelectorColaborador, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './planilla-nueva.html',
  styleUrl: './planilla-nueva.scss',
})
export class PlanillaNueva implements OnInit {
  private readonly epp = inject(EppService);
  private readonly actas = inject(ActasService);
  private readonly inventario = inject(InventarioService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly router = inject(Router);

  protected readonly motivos = MOTIVOS;
  protected readonly hoy = hoy();
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly catalogo = signal<Elemento[]>([]);
  protected readonly colaboradores = signal<FilaColaborador[]>([]);
  protected readonly fecha = signal(this.hoy);
  protected readonly motivo = signal('INGRESO');
  protected readonly observaciones = signal('');
  protected readonly columnas = signal<Columna[]>([]);
  protected readonly personas = signal<Persona[]>([]);
  protected readonly nuevoEpp = signal<number | null>(null);
  protected readonly nuevaPersona = signal<number | null>(null);
  protected readonly cargoParaAgregar = signal<string | null>(null);

  protected readonly cargos = computed(() => [...new Set(this.colaboradores().map((c) => c.cargo))].sort((a, b) => a.localeCompare(b, 'es')));
  protected readonly disponiblesParaColumna = computed(() => this.catalogo().filter((e) => !this.columnas().some((c) => c.elementoId === e.id)));

  /** Cuánto se necesita de cada EPP y talla, contra lo que hay en bodega. */
  protected readonly faltantes = computed(() => {
    const necesita = new Map<string, { nombre: string; talla: string; cantidad: number; hay: number }>();
    for (const col of this.columnas()) {
      const e = this.elemento(col.elementoId)!;
      for (const p of this.personas()) {
        const c = p.celdas[col.elementoId];
        if (!c?.incluir) continue;
        const talla = e.manejaTallas ? c.talla.trim().toUpperCase() : 'UNICA';
        if (!talla) continue;
        const clave = `${e.id}-${talla}`;
        const actual = necesita.get(clave) ?? { nombre: e.nombre, talla, cantidad: 0, hay: e.existencias.find((x) => x.talla === talla)?.cantidad ?? 0 };
        actual.cantidad += col.cantidad;
        necesita.set(clave, actual);
      }
    }
    return [...necesita.values()].filter((n) => n.cantidad > n.hay);
  });

  protected readonly sinTalla = computed(() => {
    let n = 0;
    for (const col of this.columnas()) {
      if (!this.elemento(col.elementoId)?.manejaTallas) continue;
      for (const p of this.personas()) if (p.celdas[col.elementoId]?.incluir && !p.celdas[col.elementoId].talla.trim()) n++;
    }
    return n;
  });

  async ngOnInit() {
    try {
      const [catalogo, colaboradores] = await Promise.all([this.inventario.elementos('EPP'), this.colaboradoresApi.listar()]);
      this.catalogo.set(catalogo.filter((e) => e.activo));
      this.colaboradores.set(colaboradores.filter((c) => c.estado === 'ACTIVO'));
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el formulario'));
    } finally {
      this.cargando.set(false);
    }
  }

  elemento(id: number) {
    return this.catalogo().find((e) => e.id === id);
  }

  // --- Columnas (EPP) ---
  agregarColumna(id: number | null) {
    if (!id) return;
    const e = this.elemento(id)!;
    this.columnas.update((cs) => [...cs, { elementoId: id, cantidad: 1 }]);
    this.personas.update((ps) => ps.map((p) => ({ ...p, celdas: { ...p.celdas, [id]: { incluir: true, talla: this.tallaDe(p, e) } } })));
    setTimeout(() => this.nuevoEpp.set(null));
  }

  quitarColumna(id: number) {
    this.columnas.update((cs) => cs.filter((c) => c.elementoId !== id));
  }

  cambiarCantidad(id: number, cantidad: number) {
    this.columnas.update((cs) => cs.map((c) => (c.elementoId === id ? { ...c, cantidad: Math.max(1, Number(cantidad) || 1) } : c)));
  }

  // --- Personas ---
  async agregarPersona(id: number | null) {
    if (!id || this.personas().some((p) => p.colaboradorId === id)) {
      setTimeout(() => this.nuevaPersona.set(null));
      return;
    }
    await this.agregar([id]);
    setTimeout(() => this.nuevaPersona.set(null));
  }

  async agregarCargo(cargo: string | null) {
    if (!cargo) return;
    const ids = this.colaboradores().filter((c) => c.cargo === cargo && !this.personas().some((p) => p.colaboradorId === c.id)).map((c) => c.id);
    await this.agregar(ids);
    setTimeout(() => this.cargoParaAgregar.set(null));
  }

  private async agregar(ids: number[]) {
    // Las tallas de la ficha se usan para proponer la talla de cada EPP
    const tenencias = await Promise.all(ids.map((id) => this.actas.tenencia(id).catch(() => null)));
    const nuevas = ids.map((id, i) => {
      const c = this.colaboradores().find((x) => x.id === id)!;
      const tallas = Object.fromEntries((tenencias[i]?.tallas ?? []).map((t) => [t.tipo, t.talla]));
      const p: Persona = { colaboradorId: id, nombre: `${c.nombres} ${c.apellidos}`, cargo: c.cargo, tallas, celdas: {} };
      for (const col of this.columnas()) p.celdas[col.elementoId] = { incluir: true, talla: this.tallaDe(p, this.elemento(col.elementoId)!) };
      return p;
    });
    this.personas.update((ps) => [...ps, ...nuevas]);
  }

  quitarPersona(id: number) {
    this.personas.update((ps) => ps.filter((p) => p.colaboradorId !== id));
  }

  cambiarCelda(p: Persona, elementoId: number, cambio: Partial<{ incluir: boolean; talla: string }>) {
    this.personas.update((ps) => ps.map((x) => (x.colaboradorId === p.colaboradorId ? { ...x, celdas: { ...x.celdas, [elementoId]: { ...x.celdas[elementoId], ...cambio } } } : x)));
  }

  private tallaDe(p: Persona, e: Elemento): string {
    if (!e.manejaTallas) return '';
    const tipo = tipoTallaDe(`${e.subcategoria ?? ''} ${e.nombre}`);
    return (tipo && p.tallas[tipo]) || '';
  }

  async guardar() {
    const personas = this.personas()
      .map((p) => ({
        colaboradorId: p.colaboradorId,
        lineas: this.columnas()
          .filter((c) => p.celdas[c.elementoId]?.incluir)
          .map((c) => ({ elementoId: c.elementoId, talla: this.elemento(c.elementoId)!.manejaTallas ? p.celdas[c.elementoId].talla.trim() : null, cantidad: c.cantidad })),
      }))
      .filter((p) => p.lineas.length);
    if (!this.columnas().length) return this.error.set('Agregue al menos un EPP');
    if (personas.length < 2) return this.error.set('La planilla es para dos personas o más. Para una sola use "Entregar EPP"');
    if (this.sinTalla()) return this.error.set(`Faltan ${this.sinTalla()} tallas por escribir`);
    if (this.faltantes().length) return this.error.set('No alcanza el stock: revise lo marcado en rojo');
    this.guardando.set(true);
    this.error.set(null);
    try {
      const p = await this.epp.crearPlanilla({ fecha: this.fecha(), motivo: this.motivo(), observaciones: this.observaciones().trim() || null, personas });
      await this.router.navigate(['/epp/planillas', p.id], { queryParams: { nueva: 1 } });
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
