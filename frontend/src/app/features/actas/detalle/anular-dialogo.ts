import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Acta, ActasService } from '../actas.service';

@Component({
  selector: 'app-anular-dialogo',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Anular el acta {{ a.consecutivo }}</h2>
    <mat-dialog-content>
      <p class="sgth-ayuda">{{ efecto }} El acta no se borra: queda marcada como anulada con el motivo, y su PDF lleva la marca.</p>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <mat-form-field class="ancho">
        <mat-label>Motivo de la anulación</mat-label>
        <input matInput [(ngModel)]="motivo" maxlength="255" placeholder="Se registró al colaborador equivocado" cdkFocusInitial>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button class="sgth-boton-peligro" type="button" (click)="anular()" [disabled]="guardando()">{{ guardando() ? 'Anulando…' : 'Anular acta' }}</button>
    </mat-dialog-actions>
  `,
  styles: `.ancho { width: 100%; }`,
})
export class AnularDialogo {
  private readonly api = inject(ActasService);
  private readonly ref = inject(MatDialogRef<AnularDialogo>);
  protected readonly a = inject<Acta>(MAT_DIALOG_DATA);
  protected motivo = '';
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly efecto = this.a.tipo === 'DEVOLUCION'
    ? 'Los elementos vuelven a quedar a cargo del colaborador.'
    : this.a.colaboradorAnterior
      ? `Los elementos vuelven a ${this.a.colaboradorAnterior}.`
      : this.a.esHistorica
        ? 'Los equipos y muebles vuelven a quedar disponibles.'
        : 'Los elementos vuelven a bodega.';

  async anular() {
    if (!this.motivo.trim()) {
      this.error.set('Explique por qué se anula');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.api.anular(this.a.id, this.motivo.trim()));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
