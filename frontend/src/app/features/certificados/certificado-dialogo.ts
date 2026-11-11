import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { SesionService } from '../../core/sesion.service';
import { abrirPdf } from '../inventario/inventario.service';
import { type Certificado, CertificadosService, type EstadoCertificado, unirLista } from './certificados.service';

export interface DatosCertificadoDialogo { colaboradorId: number; nombre: string }

/** Expide un certificado laboral y lo abre en una pestaña nueva. */
@Component({
  selector: 'app-certificado-dialogo',
  imports: [FormsModule, RouterLink, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Certificado laboral</h2>
    <mat-dialog-content>
      @if (fallo()) {
        <p class="error" role="alert">{{ fallo() }}</p>
      } @else if (!estado()) {
        <mat-progress-bar mode="indeterminate" aria-label="Cargando" />
      } @else if (estado()!.faltantes.length) {
        <p class="aviso" role="alert">
          <mat-icon>settings_alert</mat-icon>
          <span>
            Para expedir certificados falta registrar {{ faltantes() }}.
            @if (puedeConfigurar) {
              <a routerLink="/administracion/configuracion" mat-dialog-close>Ir a Configuración</a>
            } @else {
              Pídale al administrador que lo registre en Configuración.
            }
          </span>
        </p>
      } @else {
        @let e = estado()!;
        <p class="ayuda">
          Para <strong>{{ d.nombre }}</strong>{{ e.retirado ? ' (retirado: dirá "laboró desde … hasta …")' : '' }}.
          Firma {{ e.firmante.nombre }}, {{ e.firmante.cargo }}.
        </p>

        <fieldset>
          <legend>Salario</legend>
          <mat-radio-group [(ngModel)]="conSalario" aria-label="Salario" class="opciones">
            <mat-radio-button [value]="false">Sin salario</mat-radio-button>
            <mat-radio-button [value]="true" [disabled]="!e.puedeConSalario || !e.tieneSalario">Con salario</mat-radio-button>
          </mat-radio-group>
          @if (!e.puedeConSalario) {
            <p class="nota">Su rol no puede ver salarios.</p>
          } @else if (!e.tieneSalario) {
            <p class="nota">El colaborador no tiene salario registrado en su ficha.</p>
          }
        </fieldset>

        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Dirigido a (opcional)</mat-label>
          <input matInput [(ngModel)]="dirigidoA" maxlength="150" placeholder="Por ejemplo, Bancolombia S.A.">
          <mat-hint>Si lo deja vacío, dice "A QUIEN INTERESE".</mat-hint>
        </mat-form-field>

        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="button" (click)="generar()" [disabled]="!!fallo() || !estado() || estado()!.faltantes.length > 0 || generando()">
        <mat-icon>description</mat-icon>{{ generando() ? 'Generando…' : 'Generar certificado' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { display: grid; gap: 16px; min-width: min(460px, 80vw); }
    .ayuda { margin: 0; color: var(--sgth-tinta-suave); }
    fieldset { margin: 0; padding: 0; border: 0; }
    legend { margin-bottom: 4px; font-weight: 600; }
    .opciones { display: flex; gap: 20px; }
    .nota { margin: 2px 0 0; font-size: 0.82rem; color: var(--sgth-tinta-suave); }
    mat-form-field { width: 100%; }
    .aviso {
      display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 8px;
      background: var(--sgth-ambar-fondo);
      mat-icon { color: var(--sgth-ambar); flex: none; }
      a { margin-left: 4px; color: var(--sgth-petroleo); }
    }
    .error { margin: 0; color: var(--sgth-error); }
  `,
})
export class CertificadoDialogo implements OnInit {
  protected readonly d = inject<DatosCertificadoDialogo>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CertificadoDialogo, Certificado>);
  private readonly api = inject(CertificadosService);
  protected readonly puedeConfigurar = inject(SesionService).puede('configuracion.gestionar');

  protected readonly estado = signal<EstadoCertificado | null>(null);
  protected readonly generando = signal(false);
  protected readonly error = signal('');
  /** No se pudo consultar si se puede expedir: no se muestra el formulario. */
  protected readonly fallo = signal('');
  protected conSalario = false;
  protected dirigidoA = '';

  protected faltantes = () => unirLista(this.estado()?.faltantes ?? []);

  async ngOnInit() {
    try {
      this.estado.set(await this.api.estado(this.d.colaboradorId));
    } catch (e) {
      this.fallo.set(e instanceof HttpErrorResponse && e.status === 404
        ? 'El servidor del SGTH todavía no tiene los certificados. Hay que reiniciar el backend con la versión nueva.'
        : mensajeDeError(e, 'No se pudo consultar los datos del certificado'));
    }
  }

  async generar() {
    this.generando.set(true);
    this.error.set('');
    let creado: Certificado | null = null;
    try {
      await abrirPdf(async () => {
        creado = await this.api.crear(this.d.colaboradorId, this.conSalario, this.dirigidoA.trim() || null);
        return this.api.pdf(creado.id);
      }, 'Certificado_laboral.pdf');
      this.ref.close(creado!);
    } catch (e) {
      if (creado) this.ref.close(creado); // se expidió, solo falló abrir el PDF
      else this.error.set(mensajeDeError(e, 'No se pudo generar el certificado'));
    } finally {
      this.generando.set(false);
    }
  }
}
