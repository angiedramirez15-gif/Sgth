import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { ColaboradoresService, type Documento, type Expediente as DatosExpediente, guardarArchivo } from '../colaboradores.service';
import { DocumentoDialogo, type DatosDocumentoDialogo } from './documento-dialogo';

/** Pestaña "Documentos" de la ficha (RF-20 a RF-24). */
@Component({
  selector: 'app-expediente',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule],
  templateUrl: './expediente.html',
  styleUrl: './expediente.scss',
})
export class Expediente implements OnInit {
  private readonly api = inject(ColaboradoresService);
  private readonly dialogo = inject(MatDialog);
  private readonly avisos = inject(AvisosService);
  protected readonly puedeGestionar = inject(SesionService).puede('documentos.gestionar');

  readonly colaboradorId = input.required<number>();
  readonly retirado = input(false);
  readonly cambio = output<number>(); // cantidad de documentos vigentes, para el título de la pestaña

  protected readonly datos = signal<DatosExpediente | null>(null);
  protected readonly cargando = signal(true);
  protected readonly verAnteriores = signal(false);

  protected readonly vigentes = computed(() => this.datos()?.documentos.filter((d) => d.vigente) ?? []);
  protected readonly anteriores = computed(() => this.datos()?.documentos.filter((d) => !d.vigente) ?? []);
  protected readonly alertas = computed(() => this.vigentes().filter((d) => d.estadoVencimiento === 'VENCIDO' || d.estadoVencimiento === 'POR_VENCER'));

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      const d = await this.api.expediente(this.colaboradorId());
      this.datos.set(d);
      this.cambio.emit(d.documentos.filter((x) => x.vigente).length);
    } catch (e) {
      this.avisos.error(e, 'No se pudieron cargar los documentos');
    } finally {
      this.cargando.set(false);
    }
  }

  async agregar(tipoInicial?: number) {
    await this.abrirDialogo({ tipoInicial });
  }

  async reemplazar(doc: Documento) {
    await this.abrirDialogo({ reemplaza: doc });
  }

  private async abrirDialogo(extra: Partial<DatosDocumentoDialogo>) {
    const d = this.datos();
    if (!d) return;
    const ref = this.dialogo.open<DocumentoDialogo, DatosDocumentoDialogo, boolean>(DocumentoDialogo, {
      data: { colaboradorId: this.colaboradorId(), tipos: d.tipos, maxMb: d.maxMb, ...extra },
      width: '560px',
      maxWidth: '95vw',
    });
    if (await firstValueFrom(ref.afterClosed())) {
      this.avisos.exito(extra.reemplaza ? 'Documento reemplazado' : 'Documento guardado');
      await this.cargar();
    }
  }

  async ver(doc: Documento) {
    // La ventana se abre antes de descargar para que el navegador no la bloquee
    const ventana = window.open('', '_blank');
    try {
      const blob = await this.api.archivoDocumento(doc.id);
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url;
      else guardarArchivo(blob, doc.nombreOriginal);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      ventana?.close();
      this.avisos.error(e, 'No se pudo abrir el documento');
    }
  }

  async descargar(doc: Documento) {
    try {
      guardarArchivo(await this.api.archivoDocumento(doc.id), doc.nombreOriginal);
    } catch (e) {
      this.avisos.error(e, 'No se pudo descargar el documento');
    }
  }

  async inactivar(doc: Documento) {
    const ok = await this.avisos.confirmar({
      titulo: 'Quitar documento',
      mensaje: doc.reemplazaAId
        ? `"${doc.tipoDocumento}" se quitará del expediente y la versión anterior volverá a ser la vigente. Use esta opción solo si se cargó por error.`
        : `"${doc.tipoDocumento}" se quitará del expediente. Use esta opción solo si se cargó por error; el archivo se conserva en el servidor.`,
      accion: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await this.api.inactivarDocumento(doc.id);
      this.avisos.exito('Documento quitado');
      await this.cargar();
    } catch (e) {
      this.avisos.error(e);
    }
  }

  tamano(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
