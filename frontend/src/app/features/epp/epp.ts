import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SesionService } from '../../core/sesion.service';
import { AvisosService } from '../../shared/avisos.service';
import { sinTildes } from '../colaboradores/colaboradores.service';
import { type CargoMatriz, EppService, type FilaPlanilla, type Reposiciones } from '../actas/actas.service';
import { type Elemento, InventarioService } from '../inventario/inventario.service';
import { Stock } from '../inventario/stock/stock';

const PESTANAS = ['reponer', 'inventario', 'matriz', 'planillas'];

interface FilaMatriz { elementoId: number; nombre: string; subcategoria: string | null; requiere: boolean; cantidad: number; observacion: string }

@Component({
  selector: 'app-epp',
  imports: [
    DatePipe, FormsModule, RouterLink, Stock, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule, MatTabsModule,
  ],
  templateUrl: './epp.html',
  styleUrl: './epp.scss',
})
export class Epp implements OnInit {
  private readonly api = inject(EppService);
  private readonly inventario = inject(InventarioService);
  private readonly avisos = inject(AvisosService);
  protected readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sesion = inject(SesionService);
  protected readonly puedeEntregar = this.sesion.puede('actas_epp.gestionar');
  protected readonly puedeMatriz = this.sesion.puede('inventario_epp.gestionar');

  protected readonly pestana = signal(Math.max(PESTANAS.indexOf(this.ruta.snapshot.queryParamMap.get('ver') ?? ''), 0));
  protected readonly cargando = signal(true);

  // Por reponer
  protected readonly reposiciones = signal<Reposiciones | null>(null);
  protected readonly filtro = signal<'todos' | 'vencidos' | 'pronto' | 'sin'>('todos');
  protected readonly texto = signal('');
  protected readonly vencidos = computed(() => (this.reposiciones()?.porReponer ?? []).filter((p) => p.dias < 0));
  protected readonly pronto = computed(() => (this.reposiciones()?.porReponer ?? []).filter((p) => p.dias >= 0));
  /** Una fila por persona con todo lo que le falta, para entregarle de una vez. */
  protected readonly porPersona = computed(() => {
    const r = this.reposiciones();
    if (!r) return [];
    const t = sinTildes(this.texto().trim());
    const mapa = new Map<number, { colaboradorId: number; colaborador: string; cargo: string; items: { epp: string; detalle: string; tipo: 'vencido' | 'pronto' | 'sin'; actaId?: number }[] }>();
    const agregar = (id: number, colaborador: string, cargo: string, item: { epp: string; detalle: string; tipo: 'vencido' | 'pronto' | 'sin'; actaId?: number }) => {
      if (!mapa.has(id)) mapa.set(id, { colaboradorId: id, colaborador, cargo, items: [] });
      mapa.get(id)!.items.push(item);
    };
    const f = this.filtro();
    for (const p of r.porReponer) {
      const tipo = p.dias < 0 ? 'vencido' : 'pronto';
      if (f !== 'todos' && f !== (tipo === 'vencido' ? 'vencidos' : 'pronto')) continue;
      agregar(p.colaboradorId, p.colaborador, p.cargo, {
        epp: p.epp + (p.talla !== 'UNICA' ? ` (${p.talla})` : ''),
        detalle: p.dias < 0 ? `venció hace ${-p.dias} día${p.dias === -1 ? '' : 's'}` : p.dias === 0 ? 'vence hoy' : `vence en ${p.dias} día${p.dias === 1 ? '' : 's'}`,
        tipo, actaId: p.actaId,
      });
    }
    if (f === 'todos' || f === 'sin') {
      for (const s of r.sinEntregar) agregar(s.colaboradorId, s.colaborador, s.cargo, { epp: s.epp, detalle: 'nunca entregado', tipo: 'sin' });
    }
    const orden = { vencido: 0, sin: 1, pronto: 2 };
    return [...mapa.values()]
      .filter((p) => !t || sinTildes(`${p.colaborador} ${p.cargo}`).includes(t))
      .map((p) => ({ ...p, items: p.items.sort((a, b) => orden[a.tipo] - orden[b.tipo]) }))
      .sort((a, b) => orden[a.items[0].tipo] - orden[b.items[0].tipo] || a.colaborador.localeCompare(b.colaborador, 'es'));
  });

  // Matriz
  protected readonly cargos = signal<CargoMatriz[]>([]);
  protected readonly catalogoEpp = signal<Elemento[]>([]);
  protected readonly cargoId = signal<number | null>(null);
  protected readonly filasMatriz = signal<FilaMatriz[]>([]);
  protected readonly guardandoMatriz = signal(false);
  protected readonly cargo = computed(() => this.cargos().find((c) => c.id === this.cargoId()) ?? null);
  protected readonly cambiosMatriz = computed(() => {
    const c = this.cargo();
    if (!c) return false;
    const actual = this.filasMatriz().filter((f) => f.requiere).map((f) => `${f.elementoId}:${f.cantidad}:${f.observacion.trim()}`).sort().join('|');
    const guardado = c.items.map((i) => `${i.elementoId}:${i.cantidad}:${(i.observacion ?? '').trim()}`).sort().join('|');
    return actual !== guardado;
  });

  // Planillas
  protected readonly planillas = signal<FilaPlanilla[]>([]);

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      const [r, cargos, epp, planillas] = await Promise.all([this.api.reposiciones(), this.api.matriz(), this.inventario.elementos('EPP'), this.api.planillas()]);
      this.reposiciones.set(r);
      this.cargos.set(cargos);
      this.catalogoEpp.set(epp.filter((e) => e.activo));
      this.planillas.set(planillas);
      if (!this.cargoId() && cargos.length) this.elegirCargo(cargos.find((c) => c.items.length) ?? cargos[0]);
      else if (this.cargo()) this.elegirCargo(this.cargo()!);
    } catch (e) {
      this.avisos.error(e, 'No se pudo cargar la información de EPP');
    } finally {
      this.cargando.set(false);
    }
  }

  cambiarPestana(i: number) {
    this.pestana.set(i);
    this.router.navigate([], { queryParams: { ver: i ? PESTANAS[i] : null }, replaceUrl: true });
  }

  entregar(colaboradorId: number) {
    this.router.navigate(['/actas/entrega'], { queryParams: { tipo: 'EPP', colaborador: colaboradorId } });
  }

  // --- Matriz ---
  async elegirCargo(c: CargoMatriz) {
    if (c.id !== this.cargoId() && this.cambiosMatriz()) {
      const ok = await this.avisos.confirmar({ titulo: 'Descartar cambios', mensaje: `No ha guardado la matriz de ${this.cargo()!.nombre}.`, accion: 'Descartar', peligro: true });
      if (!ok) return;
    }
    this.cargoId.set(c.id);
    this.filasMatriz.set(this.catalogoEpp().map((e) => {
      const i = c.items.find((x) => x.elementoId === e.id);
      return { elementoId: e.id, nombre: e.nombre, subcategoria: e.subcategoria, requiere: !!i, cantidad: i?.cantidad ?? 1, observacion: i?.observacion ?? '' };
    }));
  }

  cambiarFila(f: FilaMatriz, cambio: Partial<FilaMatriz>) {
    this.filasMatriz.update((fs) => fs.map((x) => (x.elementoId === f.elementoId ? { ...x, ...cambio } : x)));
  }

  async guardarMatriz() {
    const c = this.cargo()!;
    this.guardandoMatriz.set(true);
    try {
      await this.api.guardarMatriz(c.id, this.filasMatriz().filter((f) => f.requiere).map((f) => ({ elementoId: f.elementoId, cantidad: Number(f.cantidad) || 1, observacion: f.observacion.trim() || null })));
      this.avisos.exito(`Matriz de ${c.nombre} guardada`);
      const [cargos, r] = await Promise.all([this.api.matriz(), this.api.reposiciones()]);
      this.cargos.set(cargos);
      this.reposiciones.set(r);
      this.elegirCargo(cargos.find((x) => x.id === c.id)!);
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.guardandoMatriz.set(false);
    }
  }
}
