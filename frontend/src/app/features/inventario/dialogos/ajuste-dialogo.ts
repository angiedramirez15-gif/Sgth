import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Elemento, InventarioService } from '../inventario.service';

@Component({
  selector: 'app-ajuste-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule],
  template: `
    <h2 mat-dialog-title>Ajustar stock de {{ e.nombre }}</h2>
    <mat-dialog-content>
      <p class="sgth-ayuda">Para corregir el stock después de un conteo, o registrar algo dañado o perdido en bodega. Las entregas a colaboradores se hacen con acta, no aquí.</p>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-ajuste" (ngSubmit)="guardar()" class="sgth-dialogo-form sgth-dialogo-form--dos" novalidate>
        <mat-button-toggle-group formControlName="tipo" class="completo" aria-label="Tipo de ajuste" hideSingleSelectionIndicator>
          <mat-button-toggle value="AJUSTE_NEGATIVO">Restar</mat-button-toggle>
          <mat-button-toggle value="AJUSTE_POSITIVO">Sumar</mat-button-toggle>
        </mat-button-toggle-group>
        @if (e.manejaTallas) {
          <mat-form-field>
            <mat-label>Talla</mat-label>
            <input matInput formControlName="talla" maxlength="10" list="tallas-ajuste">
            <datalist id="tallas-ajuste">@for (x of e.existencias; track x.talla) { <option [value]="x.talla"></option> }</datalist>
            <mat-error>Indique la talla</mat-error>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Cantidad</mat-label>
          <input matInput type="number" formControlName="cantidad" min="1">
          <mat-hint>Hay {{ hay() }} en bodega</mat-hint>
          <mat-error>Escriba una cantidad mayor que cero</mat-error>
        </mat-form-field>
        <mat-form-field class="completo">
          <mat-label>Motivo</mat-label>
          <input matInput formControlName="observacion" maxlength="255" placeholder="Conteo físico del 9 de noviembre">
          <mat-error>Explique el motivo</mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-ajuste" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar ajuste' }}</button>
    </mat-dialog-actions>
  `,
  styles: `mat-button-toggle-group { justify-self: start; margin-bottom: 14px; }`,
})
export class AjusteDialogo {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<AjusteDialogo>);
  protected readonly e = inject<Elemento>(MAT_DIALOG_DATA);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    tipo: ['AJUSTE_NEGATIVO' as 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'],
    talla: [this.e.existencias.length === 1 ? this.e.existencias[0].talla : ''],
    cantidad: [null as unknown as number, [Validators.required, Validators.min(1)]],
    observacion: ['', [Validators.required, Validators.maxLength(255)]],
  });

  private readonly talla = toSignal(this.form.controls.talla.valueChanges, { initialValue: this.form.controls.talla.value });
  protected readonly hay = computed(() => {
    const t = this.e.manejaTallas ? this.talla().trim().toUpperCase() : 'UNICA';
    return this.e.existencias.find((x) => x.talla === t)?.cantidad ?? 0;
  });

  async guardar() {
    const v = this.form.getRawValue();
    if (this.e.manejaTallas && !v.talla.trim()) this.form.controls.talla.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.api.ajuste({
        elementoId: this.e.id,
        talla: this.e.manejaTallas ? v.talla.trim() : null,
        tipo: v.tipo,
        cantidad: Number(v.cantidad),
        observacion: v.observacion.trim(),
      }));
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardando.set(false);
    }
  }
}
