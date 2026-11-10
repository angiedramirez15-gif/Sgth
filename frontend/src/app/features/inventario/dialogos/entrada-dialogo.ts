import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Elemento, InventarioService } from '../inventario.service';

export interface DatosEntrada {
  elementos: Elemento[];
  elementoId?: number; // preseleccionado
}

@Component({
  selector: 'app-entrada-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Registrar entrada</h2>
    <mat-dialog-content>
      <p class="sgth-ayuda">Lo que llegó del proveedor o se compró. Se suma al stock de bodega.</p>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-entrada" (ngSubmit)="guardar()" novalidate>
        <div class="sgth-dialogo-form sgth-dialogo-form--dos">
          <mat-form-field>
            <mat-label>Proveedor (opcional)</mat-label>
            <mat-select formControlName="proveedorId">
              <mat-option [value]="null">Sin proveedor</mat-option>
              @for (p of proveedores(); track p.id) { <mat-option [value]="p.id">{{ p.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Factura o remisión (opcional)</mat-label>
            <input matInput formControlName="numeroFactura" maxlength="40">
          </mat-form-field>
        </div>

        <fieldset class="lineas" formArrayName="lineas">
          <legend>Elementos recibidos</legend>
          @for (l of lineas.controls; track l; let i = $index) {
            <div class="linea" [formGroupName]="i">
              <mat-form-field class="linea__elemento" subscriptSizing="dynamic">
                <mat-label>Elemento</mat-label>
                <mat-select formControlName="elementoId">
                  @for (e of d.elementos; track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
              @if (manejaTallas(i)) {
                <mat-form-field class="linea__talla" subscriptSizing="dynamic">
                  <mat-label>Talla</mat-label>
                  <input matInput formControlName="talla" maxlength="10" [attr.list]="'tallas-' + i">
                  <datalist [id]="'tallas-' + i">@for (t of tallasConocidas(i); track t) { <option [value]="t"></option> }</datalist>
                </mat-form-field>
              } @else {
                <span class="linea__talla linea__sin-talla" aria-hidden="true"></span>
              }
              <mat-form-field class="linea__cantidad" subscriptSizing="dynamic">
                <mat-label>Cantidad</mat-label>
                <input matInput type="number" formControlName="cantidad" min="1">
              </mat-form-field>
              <button mat-icon-button type="button" (click)="quitar(i)" [disabled]="lineas.length === 1" [attr.aria-label]="'Quitar línea ' + (i + 1)">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
          <button mat-button type="button" (click)="agregar()"><mat-icon>add</mat-icon>Agregar otro elemento o talla</button>
        </fieldset>

        <mat-form-field class="observacion">
          <mat-label>Observación (opcional)</mat-label>
          <input matInput formControlName="observacion" maxlength="255">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-entrada" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Sumar al stock' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .lineas { margin: 4px 0 12px; padding: 12px 14px 6px; border: 1px solid var(--sgth-linea); border-radius: 8px; }
    legend { padding: 0 6px; font-weight: 600; font-size: 0.9rem; }
    .linea { display: grid; grid-template-columns: minmax(0, 1fr) 96px 104px 40px; gap: 10px; align-items: center; margin-bottom: 10px; }
    .observacion { width: 100%; }
    @media (max-width: 600px) {
      .linea { grid-template-columns: 1fr 1fr 40px; }
      .linea__elemento { grid-column: 1 / -1; }
      .linea__sin-talla { display: none; }
    }
  `,
})
export class EntradaDialogo implements OnInit {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<EntradaDialogo>);
  private readonly fb = inject(FormBuilder);
  protected readonly d = inject<DatosEntrada>(MAT_DIALOG_DATA);
  protected readonly proveedores = signal<{ id: number; nombre: string }[]>([]);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    proveedorId: [null as number | null],
    numeroFactura: [''],
    observacion: [''],
    lineas: this.fb.array([this.linea(this.d.elementoId)]),
  });

  get lineas() {
    return this.form.controls.lineas as FormArray;
  }

  async ngOnInit() {
    try {
      this.proveedores.set(await this.api.proveedores());
    } catch {
      // Sin proveedores la entrada igual se puede registrar
    }
  }

  private linea(elementoId: number | null = null) {
    return this.fb.group({
      elementoId: [elementoId, Validators.required],
      talla: [''],
      cantidad: [null as number | null, [Validators.required, Validators.min(1)]],
    });
  }

  protected elemento(i: number) {
    const id = this.lineas.at(i).get('elementoId')!.value;
    return this.d.elementos.find((e) => e.id === id);
  }

  protected manejaTallas(i: number) {
    return !!this.elemento(i)?.manejaTallas;
  }

  /** Tallas que ya tiene en stock, como sugerencia. */
  protected tallasConocidas(i: number) {
    return this.elemento(i)?.existencias.map((x) => x.talla) ?? [];
  }

  agregar() {
    // La línea nueva repite el elemento anterior: lo usual es cargar varias tallas seguidas
    const anterior = this.lineas.at(this.lineas.length - 1)?.get('elementoId')!.value;
    this.lineas.push(this.linea(anterior));
  }

  quitar(i: number) {
    this.lineas.removeAt(i);
  }

  async guardar() {
    let falta = false;
    this.lineas.controls.forEach((l, i) => {
      if (this.manejaTallas(i) && !String(l.get('talla')!.value ?? '').trim()) {
        l.get('talla')!.setErrors({ required: true });
        falta = true;
      }
    });
    if (this.form.invalid || falta) {
      this.form.markAllAsTouched();
      this.error.set('Complete el elemento, la cantidad y la talla de cada línea');
      return;
    }
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.api.entrada({
        proveedorId: v.proveedorId,
        numeroFactura: v.numeroFactura?.trim() || null,
        observacion: v.observacion?.trim() || null,
        lineas: (v.lineas as { elementoId: number; talla: string; cantidad: number }[]).map((l, i) => ({
          elementoId: l.elementoId,
          talla: this.manejaTallas(i) ? l.talla.trim() : null,
          cantidad: Number(l.cantidad),
        })),
      }));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
