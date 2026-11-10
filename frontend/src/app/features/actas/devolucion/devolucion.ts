import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/autenticacion';
import { ColaboradoresService, type FilaColaborador } from '../../colaboradores/colaboradores.service';
import { CONDICIONES, type Condicion } from '../../inventario/inventario.service';
import { ActasService, hoy, type OpcionesActas, type Tenencia } from '../actas.service';
import { SelectorColaborador } from '../selector-colaborador';

/** Un renglón de lo que el colaborador tiene, con lo que se va a registrar al recibirlo. */
interface Renglon {
  clave: string;
  activoId?: number;
  elementoId?: number;
  talla?: string;
  titulo: string;
  detalle: string;
  maximo: number;
  marcado: boolean;
  cantidad: number;
  condicion: Condicion;
  quedaEn: 'DISPONIBLE' | 'EN_REPARACION' | 'DADO_DE_BAJA';
  reingresa: boolean;
  observaciones: string;
}

@Component({
  selector: 'app-devolucion',
  imports: [FormsModule, RouterLink, SelectorColaborador, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './devolucion.html',
  styleUrl: './devolucion.scss',
})
export class Devolucion implements OnInit {
  private readonly actas = inject(ActasService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly hoy = hoy();
  protected readonly condiciones = CONDICIONES;
  protected readonly cargando = signal(true);
  protected readonly cargandoTenencia = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly opciones = signal<OpcionesActas | null>(null);
  protected readonly colaboradores = signal<FilaColaborador[]>([]);
  protected readonly colaboradorId = signal<number | null>(null);
  protected readonly tenencia = signal<Tenencia | null>(null);
  protected readonly renglones = signal<Renglon[]>([]);
  protected readonly fecha = signal(this.hoy);
  protected readonly motivo = signal('RETIRO');
  protected readonly observaciones = signal('');

  protected readonly motivos = computed(() => this.opciones()?.motivos.DEVOLUCION ?? []);
  protected readonly colaborador = computed(() => this.colaboradores().find((c) => c.id === this.colaboradorId()) ?? null);
  protected readonly activos = computed(() => this.renglones().filter((r) => r.activoId));
  protected readonly cantidades = computed(() => this.renglones().filter((r) => !r.activoId));
  protected readonly marcados = computed(() => this.renglones().filter((r) => r.marcado));

  constructor() {
    effect(() => {
      const id = this.colaboradorId();
      untracked(() => this.cargarTenencia(id));
    });
  }

  async ngOnInit() {
    try {
      const [opciones, colaboradores] = await Promise.all([this.actas.opciones(), this.colaboradoresApi.listar()]);
      this.opciones.set(opciones);
      // También los retirados: lo usual es recibir lo que tenían al retirarse
      this.colaboradores.set(colaboradores);
      const id = Number(this.ruta.snapshot.queryParamMap.get('colaborador'));
      if (id) {
        this.colaboradorId.set(id);
        const c = colaboradores.find((x) => x.id === id);
        if (c?.estado === 'ACTIVO') this.motivo.set('CAMBIO_CARGO');
      }
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el formulario'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarTenencia(id: number | null) {
    this.tenencia.set(null);
    this.renglones.set([]);
    if (!id) return;
    this.cargandoTenencia.set(true);
    try {
      const t = await this.actas.tenencia(id);
      this.tenencia.set(t);
      const unoSolo = t.activos.length + t.cantidades.length === 1;
      this.renglones.set([
        ...t.activos.map((a) => ({
          clave: `a${a.id}`, activoId: a.id, titulo: `${a.placa} ${a.elemento}`,
          detalle: [[a.marca, a.modelo].filter(Boolean).join(' '), a.serial ? `S/N ${a.serial}` : '', a.acta ? `acta ${a.acta}` : ''].filter(Boolean).join(', '),
          maximo: 1, marcado: unoSolo, cantidad: 1, condicion: (a.condicion === 'NUEVO' ? 'BUENO' : a.condicion) as Condicion,
          quedaEn: 'DISPONIBLE' as const, reingresa: false, observaciones: '',
        })),
        ...t.cantidades.map((c) => ({
          clave: `e${c.elementoId}-${c.talla}`, elementoId: c.elementoId, talla: c.talla,
          titulo: c.elemento, detalle: [c.talla !== 'UNICA' ? `talla ${c.talla}` : '', `tiene ${c.cantidad} ${c.unidad.toLowerCase()}`].filter(Boolean).join(', '),
          maximo: c.cantidad, marcado: unoSolo, cantidad: c.cantidad, condicion: 'BUENO' as Condicion,
          quedaEn: 'DISPONIBLE' as const, reingresa: c.categoria !== 'DOTACION', observaciones: '',
        })),
      ]);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo consultar lo que tiene el colaborador'));
    } finally {
      this.cargandoTenencia.set(false);
    }
  }

  cambiar(r: Renglon, cambio: Partial<Renglon>) {
    this.renglones.update((rs) => rs.map((x) => {
      if (x.clave !== r.clave) return x;
      const n = { ...x, ...cambio };
      // Un elemento en mal estado no vuelve al stock, salvo que se diga lo contrario
      if (cambio.condicion && !n.activoId) n.reingresa = cambio.condicion !== 'MALO';
      if (cambio.condicion === 'MALO' && n.activoId && n.quedaEn === 'DISPONIBLE') n.quedaEn = 'EN_REPARACION';
      return n;
    }));
  }

  marcarTodo(v: boolean) {
    this.renglones.update((rs) => rs.map((r) => ({ ...r, marcado: v })));
  }

  async guardar() {
    const elegidos = this.marcados();
    if (!this.colaboradorId()) return this.error.set('Seleccione quién devuelve');
    if (!elegidos.length) return this.error.set('Marque lo que se recibe');
    if (!this.motivo()) return this.error.set('Seleccione el motivo');
    const malo = elegidos.find((r) => !r.activoId && (!r.cantidad || r.cantidad < 1 || r.cantidad > r.maximo));
    if (malo) return this.error.set(`${malo.titulo}: la cantidad debe estar entre 1 y ${malo.maximo}`);
    this.guardando.set(true);
    this.error.set(null);
    try {
      const acta = await this.actas.devolver({
        colaboradorId: this.colaboradorId()!,
        fecha: this.fecha(),
        motivo: this.motivo(),
        observaciones: this.observaciones().trim() || null,
        lineas: elegidos.map((r) => r.activoId
          ? { activoId: r.activoId, condicion: r.condicion, quedaEn: r.quedaEn, observaciones: r.observaciones.trim() || null }
          : { elementoId: r.elementoId, talla: r.talla, cantidad: Number(r.cantidad), condicion: r.condicion, reingresa: r.reingresa, observaciones: r.observaciones.trim() || null }),
      });
      await this.router.navigate(['/actas', acta.id], { queryParams: { nueva: 1 } });
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
