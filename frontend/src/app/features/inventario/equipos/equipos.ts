import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { sinTildes } from '../../colaboradores/colaboradores.service';
import { ActivoDialogo } from '../dialogos/activo-dialogo';
import { ElementoDialogo } from '../dialogos/elemento-dialogo';
import { StickersDialogo } from '../dialogos/stickers-dialogo';
import { type Activo, type Elemento, type EstadoActivo, ESTADOS_ACTIVO, InventarioService } from '../inventario.service';
import { Stock } from '../stock/stock';

const PESTANAS = ['activos', 'otros', 'tipos'];

@Component({
  selector: 'app-equipos',
  imports: [
    FormsModule, RouterLink, Stock, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatMenuModule, MatProgressBarModule, MatSelectModule, MatTabsModule,
  ],
  templateUrl: './equipos.html',
  styleUrl: './equipos.scss',
})
export class Equipos implements OnInit {
  private readonly api = inject(InventarioService);
  private readonly avisos = inject(AvisosService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly puedeGestionar = inject(SesionService).puede('inventario_activos.gestionar');
  protected readonly estados = ESTADOS_ACTIVO;

  protected readonly pestana = signal(Math.max(PESTANAS.indexOf(this.ruta.snapshot.queryParamMap.get('ver') ?? ''), 0));
  protected readonly activos = signal<Activo[]>([]);
  protected readonly tipos = signal<Elemento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal(false);

  protected readonly texto = signal('');
  protected readonly categoria = signal<'' | 'EQUIPO' | 'MUEBLE'>('');
  protected readonly tipo = signal(0); // 0 = todos
  protected readonly estado = signal<'' | EstadoActivo | 'VIGENTES'>('VIGENTES');
  protected readonly seleccion = signal<Set<number>>(new Set());

  protected readonly tiposActivos = computed(() => this.tipos().filter((t) => t.activo));
  protected readonly tiposFiltro = computed(() => this.tipos().filter((t) => !this.categoria() || t.categoria === this.categoria()));
  protected readonly filtrados = computed(() => {
    const t = sinTildes(this.texto().trim());
    const e = this.estado();
    return this.activos().filter((a) =>
      (!this.categoria() || a.categoria === this.categoria()) &&
      (!this.tipo() || a.elementoId === this.tipo()) &&
      (e === '' || (e === 'VIGENTES' ? a.estado !== 'DADO_DE_BAJA' : a.estado === e)) &&
      (!t || sinTildes(`${a.placa} ${a.elemento} ${a.serial ?? ''} ${a.marca ?? ''} ${a.modelo ?? ''} ${a.colaborador ?? ''}`).includes(t)),
    );
  });
  protected readonly conteo = computed(() => {
    const c = { DISPONIBLE: 0, ASIGNADO: 0, EN_REPARACION: 0, DADO_DE_BAJA: 0 } as Record<EstadoActivo, number>;
    for (const a of this.activos()) c[a.estado]++;
    return c;
  });
  protected readonly seleccionados = computed(() => this.activos().filter((a) => this.seleccion().has(a.id)));
  protected readonly todosMarcados = computed(() => this.filtrados().length > 0 && this.filtrados().every((a) => this.seleccion().has(a.id)));
  protected readonly algunosMarcados = computed(() => !this.todosMarcados() && this.filtrados().some((a) => this.seleccion().has(a.id)));

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set(false);
    try {
      const [activos, equipos, muebles] = await Promise.all([this.api.activos(), this.api.elementos('EQUIPO'), this.api.elementos('MUEBLE')]);
      this.activos.set(activos);
      this.tipos.set([...equipos, ...muebles].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')));
      // Quita de la selección lo que ya no existe
      const ids = new Set(activos.map((a) => a.id));
      this.seleccion.set(new Set([...this.seleccion()].filter((i) => ids.has(i))));
    } catch (e) {
      this.error.set(true);
      this.avisos.error(e, 'No se pudo cargar el inventario de equipos y muebles');
    } finally {
      this.cargando.set(false);
    }
  }

  cambiarPestana(i: number) {
    this.pestana.set(i);
    this.router.navigate([], { queryParams: { ver: i ? PESTANAS[i] : null }, replaceUrl: true });
  }

  limpiarFiltros() {
    this.texto.set('');
    this.categoria.set('');
    this.tipo.set(0);
    this.estado.set('VIGENTES');
  }

  marcar(a: Activo, marcado: boolean) {
    const s = new Set(this.seleccion());
    if (marcado) s.add(a.id);
    else s.delete(a.id);
    this.seleccion.set(s);
  }

  marcarTodos(marcado: boolean) {
    const s = new Set(this.seleccion());
    for (const a of this.filtrados()) {
      if (marcado) s.add(a.id);
      else s.delete(a.id);
    }
    this.seleccion.set(s);
  }

  abrir(a: Activo) {
    this.router.navigate(['/equipos/activos', a.id]);
  }

  async registrar() {
    if (!this.tiposActivos().length) {
      const ok = await this.avisos.confirmar({
        titulo: 'Primero cree los tipos',
        mensaje: 'Antes de registrar un equipo o mueble, cree su tipo en el catálogo (por ejemplo "Computador portátil" o "Silla ergonómica").',
        accion: 'Crear un tipo',
      });
      if (ok) await this.nuevoTipo();
      return;
    }
    const creados = await this.dialogoResultado<Activo[]>(ActivoDialogo, { tipos: this.tiposActivos() }, '640px');
    if (!creados?.length) return;
    await this.cargar();
    const placas = creados.length === 1 ? `la placa ${creados[0].placa}` : `las placas ${creados[0].placa} a ${creados.at(-1)!.placa}`;
    const imprimir = await this.avisos.confirmar({
      titulo: creados.length === 1 ? 'Equipo registrado' : `${creados.length} unidades registradas`,
      mensaje: `Se asignó ${placas}. ¿Imprime ${creados.length === 1 ? 'el sticker' : 'los stickers'} ahora?`,
      accion: 'Imprimir',
    });
    if (imprimir) this.imprimir(creados);
  }

  imprimir(activos = this.seleccionados()) {
    if (!activos.length) return;
    this.dialogo.open(StickersDialogo, { data: activos, width: '600px', maxWidth: '95vw' });
  }

  async nuevoTipo() {
    if (await this.dialogoResultado(ElementoDialogo, { categorias: ['EQUIPO', 'MUEBLE'] }, '560px')) {
      this.avisos.exito('Tipo agregado al catálogo');
      await this.cargar();
    }
  }

  async editarTipo(t: Elemento) {
    if (await this.dialogoResultado(ElementoDialogo, { categorias: [t.categoria], elemento: t }, '560px')) {
      this.avisos.exito('Cambios guardados');
      await this.cargar();
    }
  }

  async cambiarActivoTipo(t: Elemento) {
    if (t.activo) {
      const ok = await this.avisos.confirmar({
        titulo: `Inactivar ${t.nombre}`,
        mensaje: 'No se podrán registrar unidades nuevas de este tipo. Las que ya existen no cambian.',
        accion: 'Inactivar',
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      await this.api.estadoElemento(t.id, !t.activo);
      this.avisos.exito(t.activo ? 'Tipo inactivado' : 'Tipo activado');
      await this.cargar();
    } catch (e) {
      this.avisos.error(e);
    }
  }

  filtrarPorTipo(t: Elemento) {
    this.limpiarFiltros();
    this.tipo.set(t.id);
    this.cambiarPestana(0);
  }

  private async dialogoResultado<T = unknown>(componente: unknown, data: unknown, width: string): Promise<T | undefined> {
    const ref = this.dialogo.open(componente as never, { data, width, maxWidth: '95vw', autoFocus: 'first-tabbable' });
    return firstValueFrom(ref.afterClosed()) as Promise<T | undefined>;
  }
}
