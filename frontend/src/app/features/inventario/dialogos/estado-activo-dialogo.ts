import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Activo, type EstadoActivo, ESTADOS_ACTIVO, InventarioService } from '../inventario.service';

const OPCIONES: { valor: EstadoActivo; ayuda: string }[] = [
  { valor: 'DISPONIBLE', ayuda: 'En bodega, listo para entregar' },
  { valor: 'EN_REPARACION', ayuda: 'En servicio técnico; no se puede entregar' },
  { valor: 'DADO_DE_BAJA', ayuda: 'Dañado sin arreglo, perdido o vendido. Sale del inventario' },
];

@Component({
  selector: 'app-estado-activo-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cambiar estado de {{ a.placa }}</h2>
    <mat-dialog-content>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-estado" (ngSubmit)="guardar()" novalidate>
        <mat-radio-group formControlName="estado" class="opciones" aria-label="Estado">
          @for (o of opciones; track o.valor) {
            <mat-radio-button [value]="o.valor">
              {{ estados[o.valor] }}
              <span class="pista">{{ o.ayuda }}</span>
            </mat-radio-button>
          }
        </mat-radio-group>
        <mat-form-field class="observacion">
          <mat-label>{{ pideMotivo() ? 'Motivo' : 'Observación (opcional)' }}</mat-label>
          <input matInput formControlName="observacion" maxlength="255" [placeholder]="pideMotivo() ? 'Pantalla rota sin reparación' : 'Enviado a servicio técnico'">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-estado" [class.sgth-boton-peligro]="form.controls.estado.value === 'DADO_DE_BAJA'" [disabled]="guardando()">
        {{ guardando() ? 'Guardando…' : form.controls.estado.value === 'DADO_DE_BAJA' ? 'Dar de baja' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .opciones { display: grid; gap: 10px; margin: 4px 0 18px; }
    .pista { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .observacion { width: 100%; }
  `,
})
export class EstadoActivoDialogo {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<EstadoActivoDialogo>);
  protected readonly a = inject<Activo>(MAT_DIALOG_DATA);
  protected readonly estados = ESTADOS_ACTIVO;
  protected readonly opciones = OPCIONES.filter((o) => o.valor !== this.a.estado);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    estado: [this.opciones[0].valor],
    observacion: [''],
  });

  pideMotivo() {
    return this.form.controls.estado.value === 'DADO_DE_BAJA' || this.a.estado === 'DADO_DE_BAJA';
  }

  async guardar() {
    const v = this.form.getRawValue();
    if (this.pideMotivo() && !v.observacion.trim()) {
      this.error.set(v.estado === 'DADO_DE_BAJA' ? 'Explique el motivo de la baja' : 'Explique por qué se reactiva');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.api.estadoActivo(this.a.id, v.estado, v.observacion.trim() || null));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
