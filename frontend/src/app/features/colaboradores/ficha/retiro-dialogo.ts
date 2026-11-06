import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { mensajeDeError } from '../../../core/autenticacion';
import { ColaboradoresService } from '../colaboradores.service';

const MOTIVOS = [
  'Renuncia voluntaria',
  'Terminación de contrato a término fijo',
  'Fin de obra o labor',
  'Terminación con justa causa',
  'Terminación sin justa causa',
  'Mutuo acuerdo',
  'Terminación del periodo de prueba',
  'Pensión',
  'Fallecimiento',
  'Otro',
];

export interface DatosRetiro { id: number; nombre: string; fechaIngreso: string }

@Component({
  selector: 'app-retiro-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Registrar retiro</h2>
    <mat-dialog-content>
      <p class="ayuda">{{ d.nombre }} quedará como retirado: no podrá recibir entregas nuevas, pero su ficha, documentos e historial se conservan.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-retiro" (ngSubmit)="guardar()" novalidate>
        <mat-form-field>
          <mat-label>Fecha de retiro</mat-label>
          <input matInput type="date" formControlName="fecha" [min]="d.fechaIngreso">
          <mat-error>Escriba una fecha igual o posterior al ingreso</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="motivo">
            @for (m of motivos; track m) { <mat-option [value]="m">{{ m }}</mat-option> }
          </mat-select>
          <mat-error>Seleccione el motivo</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Detalle (opcional)</mat-label>
          <textarea matInput formControlName="detalle" rows="2" maxlength="200"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-retiro" class="peligro" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Registrar retiro' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: grid; gap: 10px; padding-top: 6px; }
    mat-form-field { width: 100%; }
    .ayuda { margin: 0 0 16px; color: var(--sgth-tinta-suave); }
    .error { margin: 0 0 12px; padding: 10px 12px; border-left: 4px solid var(--sgth-error); border-radius: 6px; background: #fdecea; color: var(--sgth-error); }
    .peligro { --mat-button-filled-container-color: var(--sgth-error); }
  `,
})
export class RetiroDialogo {
  private readonly api = inject(ColaboradoresService);
  private readonly ref = inject(MatDialogRef<RetiroDialogo>);
  protected readonly d = inject<DatosRetiro>(MAT_DIALOG_DATA);
  protected readonly motivos = MOTIVOS;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    fecha: [new Date().toLocaleDateString('en-CA'), Validators.required],
    motivo: ['', Validators.required],
    detalle: [''],
  });

  async guardar() {
    const v = this.form.getRawValue();
    if (this.form.invalid || v.fecha < this.d.fechaIngreso) {
      this.form.markAllAsTouched();
      if (v.fecha < this.d.fechaIngreso) this.form.controls.fecha.setErrors({ antes: true });
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      const motivo = v.detalle.trim() ? `${v.motivo}: ${v.detalle.trim()}` : v.motivo;
      this.ref.close(await this.api.retirar(this.d.id, v.fecha, motivo));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
