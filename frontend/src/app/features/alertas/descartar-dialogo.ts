import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { mensajeDeError } from '../../core/autenticacion';
import { type Alerta, AlertasService } from './alertas.service';

@Component({
  selector: 'app-descartar-dialogo',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Descartar alerta</h2>
    <mat-dialog-content>
      <p class="alerta"><strong>{{ a.colaborador }}</strong>: {{ a.mensaje }}</p>
      <p class="sgth-ayuda">No volverá a aparecer para esta misma fecha. Si la situación cambia (por ejemplo, se sube otro documento con otra fecha), el sistema avisará de nuevo.</p>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <mat-form-field class="ancho">
        <mat-label>Motivo</mat-label>
        <input matInput [(ngModel)]="motivo" maxlength="255" placeholder="El contrato se renovó; falta subir el otrosí" cdkFocusInitial>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="button" (click)="descartar()" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Descartar' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .alerta { margin: 0 0 10px; padding: 10px 12px; border-radius: 6px; background: var(--sgth-superficie); border: 1px solid var(--sgth-linea); }
    .ancho { width: 100%; }
  `,
})
export class DescartarDialogo {
  private readonly api = inject(AlertasService);
  private readonly ref = inject(MatDialogRef<DescartarDialogo>);
  protected readonly a = inject<Alerta>(MAT_DIALOG_DATA);
  protected motivo = '';
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  async descartar() {
    if (!this.motivo.trim()) {
      this.error.set('Explique por qué se descarta');
      return;
    }
    this.guardando.set(true);
    try {
      await this.api.descartar(this.a.id, this.motivo.trim());
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
