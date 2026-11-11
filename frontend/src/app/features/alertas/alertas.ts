import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AvisosService } from '../../shared/avisos.service';
import { sinTildes } from '../colaboradores/colaboradores.service';
import { type Alerta, AlertasService, destino, ORDEN_TIPOS, type TipoAlerta, TIPOS } from './alertas.service';
import { DescartarDialogo } from './descartar-dialogo';

type Vista = 'ACTIVA' | 'DESCARTADA' | 'ATENDIDA';

@Component({
  selector: 'app-alertas',
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './alertas.html',
  styleUrl: './alertas.scss',
})
export class Alertas implements OnInit {
  private readonly api = inject(AlertasService);
  private readonly avisos = inject(AvisosService);
  private readonly dialogo = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly tipos = TIPOS;
  protected readonly destino = destino;

  protected readonly vista = signal<Vista>('ACTIVA');
  protected readonly filas = signal<Alerta[]>([]);
  protected readonly cargando = signal(true);
  protected readonly actualizando = signal(false);
  protected readonly tipo = signal<TipoAlerta | ''>((this.ruta.snapshot.queryParamMap.get('tipo') as TipoAlerta) ?? '');
  protected readonly texto = signal('');
  protected readonly avisosConfig = computed(() => this.api.resumen()?.avisos ?? []);

  protected readonly conteos = computed(() => {
    const c = new Map<TipoAlerta, number>();
    for (const a of this.filas()) c.set(a.tipo, (c.get(a.tipo) ?? 0) + 1);
    return ORDEN_TIPOS.filter((t) => c.has(t)).map((t) => ({ tipo: t, total: c.get(t)! }));
  });

  protected readonly filtradas = computed(() => {
    const t = sinTildes(this.texto().trim());
    return this.filas().filter((a) => (!this.tipo() || a.tipo === this.tipo()) && (!t || sinTildes(`${a.colaborador ?? ''} ${a.cargo ?? ''} ${a.mensaje}`).includes(t)));
  });

  /** Activas agrupadas por tipo, en el orden de importancia. */
  protected readonly grupos = computed(() => ORDEN_TIPOS
    .map((t) => ({ tipo: t, alertas: this.filtradas().filter((a) => a.tipo === t) }))
    .filter((g) => g.alertas.length));

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      this.filas.set(await this.api.listar(this.vista()));
      if (this.vista() === 'ACTIVA') await this.api.refrescar(true);
    } catch (e) {
      this.avisos.error(e, 'No se pudieron cargar las alertas');
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarVista(v: Vista) {
    this.vista.set(v);
    await this.cargar();
  }

  filtrarTipo(t: TipoAlerta | '') {
    this.tipo.set(this.tipo() === t ? '' : t);
    this.router.navigate([], { queryParams: { tipo: this.tipo() || null }, replaceUrl: true });
  }

  /** Recalcula ya mismo (por ejemplo, después de subir un documento en otra pestaña). */
  async actualizar() {
    this.actualizando.set(true);
    try {
      await this.api.actualizar();
      this.filas.set(await this.api.listar(this.vista()));
      this.avisos.exito('Alertas al día');
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.actualizando.set(false);
    }
  }

  cuando(a: Alerta) {
    if (a.dias < 0) return `hace ${-a.dias} día${a.dias === -1 ? '' : 's'}`;
    if (a.dias === 0) return 'hoy';
    return `en ${a.dias} día${a.dias === 1 ? '' : 's'}`;
  }

  async descartar(a: Alerta) {
    const ref = this.dialogo.open(DescartarDialogo, { data: a, width: '520px', maxWidth: '95vw' });
    if (await firstValueFrom(ref.afterClosed())) {
      this.filas.update((fs) => fs.filter((x) => x.id !== a.id));
      this.avisos.exito('Alerta descartada');
      await this.api.refrescar(true);
    }
  }

  async reactivar(a: Alerta) {
    try {
      await this.api.reactivar(a.id);
      this.filas.update((fs) => fs.filter((x) => x.id !== a.id));
      this.avisos.exito('Alerta activa de nuevo');
      await this.api.refrescar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
