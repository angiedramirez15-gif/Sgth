import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { ActivoDialogo } from '../dialogos/activo-dialogo';
import { EstadoActivoDialogo } from '../dialogos/estado-activo-dialogo';
import { StickersDialogo } from '../dialogos/stickers-dialogo';
import { type Activo, CONDICIONES, ESTADOS_ACTIVO, type HistorialActivo, InventarioService } from '../inventario.service';

/** Ficha de un equipo o mueble. Es la página que abre el QR del sticker. */
@Component({
  selector: 'app-activo',
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule],
  templateUrl: './activo.html',
  styleUrl: './activo.scss',
})
export class ActivoFicha implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(InventarioService);
  private readonly avisos = inject(AvisosService);
  private readonly dialogo = inject(MatDialog);
  private readonly sesion = inject(SesionService);
  protected readonly puedeGestionar = this.sesion.puede('inventario_activos.gestionar');
  protected readonly puedeEntregar = this.sesion.puede('actas_activos.gestionar');
  protected readonly estados = ESTADOS_ACTIVO;

  protected readonly activo = signal<Activo | null>(null);
  protected readonly historial = signal<HistorialActivo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);

  protected readonly condicion = computed(() => CONDICIONES.find((c) => c.valor === this.activo()?.condicion)?.etiqueta ?? '');
  protected readonly datos = computed(() => {
    const a = this.activo();
    if (!a) return [];
    return [
      { etiqueta: 'Tipo', valor: `${a.elemento} (${a.categoria === 'EQUIPO' ? 'equipo' : 'mueble'})` },
      { etiqueta: 'Marca', valor: a.marca },
      { etiqueta: 'Modelo', valor: a.modelo },
      { etiqueta: 'Serial', valor: a.serial },
      { etiqueta: 'Estado físico', valor: this.condicion() },
      { etiqueta: 'Detalle', valor: a.descripcionAdicional },
      { etiqueta: 'Proveedor', valor: a.proveedor },
      { etiqueta: 'Registrado', valor: a.creadoEn },
      { etiqueta: 'Observaciones', valor: a.observaciones },
    ];
  });

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      const id = Number(this.id());
      const [a, h] = await Promise.all([this.api.activo(id), this.api.historial(id)]);
      this.activo.set(a);
      this.historial.set(h);
    } catch (e) {
      if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 400) this.noExiste.set(true);
      else this.avisos.error(e, 'No se pudo cargar el activo');
    } finally {
      this.cargando.set(false);
    }
  }

  async editar() {
    const a = this.activo()!;
    const [equipos, muebles] = await Promise.all([this.api.elementos('EQUIPO'), this.api.elementos('MUEBLE')]);
    const tipos = [...equipos, ...muebles].filter((t) => t.activo || t.id === a.elementoId);
    const ref = this.dialogo.open(ActivoDialogo, { data: { tipos, activo: a }, width: '640px', maxWidth: '95vw' });
    if (await firstValueFrom(ref.afterClosed())) {
      this.avisos.exito('Cambios guardados');
      await this.cargar();
    }
  }

  async cambiarEstado() {
    const ref = this.dialogo.open(EstadoActivoDialogo, { data: this.activo(), width: '500px', maxWidth: '95vw' });
    const r = await firstValueFrom(ref.afterClosed());
    if (r) {
      this.avisos.exito(`Estado cambiado a ${ESTADOS_ACTIVO[(r as Activo).estado].toLowerCase()}`);
      await this.cargar();
    }
  }

  imprimir() {
    this.dialogo.open(StickersDialogo, { data: [this.activo()], width: '600px', maxWidth: '95vw' });
  }
}
