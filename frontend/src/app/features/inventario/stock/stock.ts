import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { sinTildes } from '../../colaboradores/colaboradores.service';
import { AjusteDialogo } from '../dialogos/ajuste-dialogo';
import { ElementoDialogo } from '../dialogos/elemento-dialogo';
import { EntradaDialogo } from '../dialogos/entrada-dialogo';
import { MovimientosDialogo } from '../dialogos/movimientos-dialogo';
import { CATEGORIAS, type Categoria, type Elemento, InventarioService } from '../inventario.service';

const PERMISO_GESTIONAR: Record<Categoria, string> = {
  DOTACION: 'inventario_dotacion.gestionar',
  EPP: 'inventario_epp.gestionar',
  EQUIPO: 'inventario_activos.gestionar',
  MUEBLE: 'inventario_activos.gestionar',
  OTRO: 'inventario_activos.gestionar',
};

/** Inventario por cantidad (dotación, EPP, otros): catálogo, stock por talla, entradas y ajustes. */
@Component({
  selector: 'app-stock',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatIconModule, MatMenuModule, MatProgressBarModule],
  templateUrl: './stock.html',
  styleUrl: './stock.scss',
})
export class Stock implements OnInit {
  readonly categoria = input.required<Categoria>();

  private readonly api = inject(InventarioService);
  private readonly avisos = inject(AvisosService);
  private readonly dialogo = inject(MatDialog);
  private readonly sesion = inject(SesionService);

  protected readonly filas = signal<Elemento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal(false);
  protected readonly texto = signal('');
  protected readonly verInactivos = signal(false);

  protected readonly textos = computed(() => CATEGORIAS[this.categoria()]);
  protected readonly puedeGestionar = computed(() => this.sesion.puede(PERMISO_GESTIONAR[this.categoria()]));
  protected readonly activos = computed(() => this.filas().filter((e) => e.activo));
  protected readonly inactivos = computed(() => this.filas().length - this.activos().length);
  protected readonly filtradas = computed(() => {
    const t = sinTildes(this.texto().trim());
    return this.filas().filter((e) => (this.verInactivos() || e.activo) && (!t || sinTildes(`${e.nombre} ${e.subcategoria ?? ''}`).includes(t)));
  });
  protected readonly unidadesTotales = computed(() => this.activos().reduce((s, e) => s + e.total, 0));
  protected readonly agotados = computed(() => this.activos().filter((e) => e.total === 0).length);

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set(false);
    try {
      this.filas.set(await this.api.elementos(this.categoria()));
    } catch (e) {
      this.error.set(true);
      this.avisos.error(e, 'No se pudo cargar el inventario');
    } finally {
      this.cargando.set(false);
    }
  }

  /** "Und" se lee "unidad"; "Par", "Juego" quedan igual. */
  unidad(e: Elemento) {
    const u = e.unidad.trim().toLowerCase().replace(/\.$/, '');
    return ['und', 'un', 'u', 'unid'].includes(u) ? 'unidad' : u;
  }

  bajoMinimo(e: Elemento) {
    return e.stockMinimo !== null && e.total <= e.stockMinimo;
  }

  async nuevo() {
    if (await this.abrir(ElementoDialogo, { categorias: [this.categoria()] }, '560px')) {
      this.avisos.exito('Elemento agregado al catálogo');
      await this.cargar();
    }
  }

  async editar(e: Elemento) {
    if (await this.abrir(ElementoDialogo, { categorias: [this.categoria()], elemento: e }, '560px')) {
      this.avisos.exito('Cambios guardados');
      await this.cargar();
    }
  }

  async entrada(e?: Elemento) {
    const elementos = this.activos();
    if (!elementos.length) {
      this.avisos.error(null, 'Primero agregue elementos al catálogo');
      return;
    }
    const r = await this.abrir<{ lineas: unknown[] }>(EntradaDialogo, { elementos, elementoId: e?.id }, '680px');
    if (r) {
      this.avisos.exito(r.lineas.length === 1 ? 'Entrada registrada' : `Entrada registrada: ${r.lineas.length} líneas`);
      await this.cargar();
    }
  }

  async ajustar(e: Elemento) {
    const r = await this.abrir<{ saldo: number; talla: string }>(AjusteDialogo, e, '520px');
    if (r) {
      this.avisos.exito(`Ajuste guardado. Quedan ${r.saldo}${r.talla === 'UNICA' ? '' : ' en talla ' + r.talla}`);
      await this.cargar();
    }
  }

  movimientos(e: Elemento) {
    this.dialogo.open(MovimientosDialogo, { data: e, width: '820px', maxWidth: '95vw' });
  }

  async cambiarActivo(e: Elemento) {
    if (e.activo) {
      const ok = await this.avisos.confirmar({
        titulo: `Inactivar ${e.nombre}`,
        mensaje: e.total
          ? `Todavía hay ${e.total} en bodega. Al inactivarlo deja de aparecer en entradas y entregas, pero conserva su historial.`
          : 'Deja de aparecer en entradas y entregas, pero conserva su historial. Puede activarlo de nuevo cuando quiera.',
        accion: 'Inactivar',
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      await this.api.estadoElemento(e.id, !e.activo);
      this.avisos.exito(e.activo ? 'Elemento inactivado' : 'Elemento activado');
      await this.cargar();
    } catch (err) {
      this.avisos.error(err);
    }
  }

  private async abrir<T = unknown>(componente: unknown, data: unknown, width: string): Promise<T | undefined> {
    const ref = this.dialogo.open(componente as never, { data, width, maxWidth: '95vw', autoFocus: 'first-tabbable' });
    return firstValueFrom(ref.afterClosed()) as Promise<T | undefined>;
  }
}
