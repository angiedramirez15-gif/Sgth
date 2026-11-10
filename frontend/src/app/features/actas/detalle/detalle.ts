import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { abrirPdf } from '../../inventario/inventario.service';
import { type Acta, ActasService, ESTADOS_ACTA } from '../actas.service';
import { AnularDialogo } from './anular-dialogo';

const PERMISO: Record<string, string> = {
  DOTACION: 'actas_dotacion.gestionar', EPP: 'actas_epp.gestionar', EQUIPOS: 'actas_activos.gestionar',
  MUEBLES: 'actas_activos.gestionar', OTROS: 'actas_activos.gestionar', DEVOLUCION: 'actas_activos.gestionar',
};

@Component({
  selector: 'app-detalle-acta',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule],
  templateUrl: './detalle.html',
  styleUrl: './detalle.scss',
})
export class DetalleActa implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(ActasService);
  private readonly avisos = inject(AvisosService);
  private readonly dialogo = inject(MatDialog);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  protected readonly nueva = inject(ActivatedRoute).snapshot.queryParamMap.get('nueva') === '1';
  protected readonly estados = ESTADOS_ACTA;

  protected readonly acta = signal<Acta | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly subiendo = signal(false);

  protected readonly puedeGestionar = computed(() => {
    const a = this.acta();
    return !!a && this.sesion.puede(PERMISO[a.plantilla]);
  });
  protected readonly porUnidad = computed(() => this.acta()?.lineas.some((l) => l.activoId) ?? false);
  protected readonly porCantidad = computed(() => this.acta()?.lineas.some((l) => !l.activoId) ?? false);
  protected readonly titulo = computed(() => {
    const a = this.acta();
    if (!a) return '';
    if (a.tipo === 'DEVOLUCION') return 'Devolución';
    if (a.colaboradorAnterior) return `Traspaso de ${a.plantillaNombre.toLowerCase()}`;
    if (a.plantilla === 'EPP') return 'Entrega de EPP';
    return `Entrega de ${a.plantillaNombre.toLowerCase()}`;
  });

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    try {
      this.acta.set(await this.api.obtener(Number(this.id())));
    } catch (e) {
      const s = (e as { status?: number }).status;
      if (s === 404 || s === 400) this.noExiste.set(true);
      else this.avisos.error(e, 'No se pudo cargar el acta');
    } finally {
      this.cargando.set(false);
    }
  }

  async verPdf() {
    const a = this.acta()!;
    try {
      await abrirPdf(() => this.api.pdf(a.id), `${a.consecutivo}.pdf`);
    } catch (e) {
      this.avisos.error(e, 'No se pudo abrir el PDF');
    }
  }

  async verFirmada() {
    const a = this.acta()!;
    try {
      await abrirPdf(() => this.api.firmada(a.id), `${a.consecutivo}_firmada.pdf`);
    } catch (e) {
      this.avisos.error(e, 'No se pudo abrir el acta firmada');
    }
  }

  async verOriginal() {
    const a = this.acta()!;
    try {
      await abrirPdf(() => this.api.original(a.id), `${a.consecutivo}_original.pdf`);
    } catch (e) {
      this.avisos.error(e, 'No se pudo abrir el documento original');
    }
  }

  async subir(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    const a = this.acta()!;
    if (a.tieneFirmada) {
      const ok = await this.avisos.confirmar({
        titulo: 'Reemplazar el acta firmada',
        mensaje: 'Ya hay un acta firmada cargada. La nueva la reemplaza; la anterior queda en el historial de auditoría.',
        accion: 'Reemplazar',
      });
      if (!ok) return;
    }
    this.subiendo.set(true);
    try {
      this.acta.set(await this.api.subirFirmada(a.id, archivo));
      this.avisos.exito('Acta firmada guardada');
    } catch (e) {
      this.avisos.error(e, 'No se pudo subir el archivo');
    } finally {
      this.subiendo.set(false);
    }
  }

  async anular() {
    const ref = this.dialogo.open(AnularDialogo, { data: this.acta(), width: '520px', maxWidth: '95vw' });
    const r = await firstValueFrom(ref.afterClosed());
    if (r) {
      this.acta.set(r as Acta);
      this.avisos.exito('Acta anulada');
    }
  }

  nuevaEntrega() {
    const a = this.acta()!;
    this.router.navigate(['/actas/entrega'], { queryParams: { colaborador: a.colaboradorId } });
  }
}
