import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Activo, CONDICIONES, type Condicion, type Elemento, InventarioService } from '../inventario.service';

export interface DatosActivoDialogo {
  tipos: Elemento[]; // tipos de equipo y mueble activos
  activo?: Activo;
}

@Component({
  selector: 'app-activo-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ d.activo ? 'Editar ' + d.activo.placa : 'Registrar equipo o mueble' }}</h2>
    <mat-dialog-content>
      @if (!d.activo) {
        <p class="sgth-ayuda">El sistema le asigna la placa al guardar. Después puede imprimir el sticker para pegarlo.</p>
      }
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-activo" (ngSubmit)="guardar()" class="sgth-dialogo-form sgth-dialogo-form--dos" novalidate>
        <mat-form-field class="completo">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="elementoId">
            @if (equipos().length) {
              <mat-optgroup label="Equipos">
                @for (t of equipos(); track t.id) { <mat-option [value]="t.id">{{ t.nombre }}</mat-option> }
              </mat-optgroup>
            }
            @if (muebles().length) {
              <mat-optgroup label="Muebles">
                @for (t of muebles(); track t.id) { <mat-option [value]="t.id">{{ t.nombre }}</mat-option> }
              </mat-optgroup>
            }
          </mat-select>
          <mat-error>Seleccione el tipo</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Marca</mat-label>
          <input matInput formControlName="marca" maxlength="80">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Modelo</mat-label>
          <input matInput formControlName="modelo" maxlength="80">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Serial</mat-label>
          <input matInput formControlName="serial" maxlength="80">
          @if (variasUnidades()) { <mat-hint>Con varias unidades se deja vacío</mat-hint> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Estado físico</mat-label>
          <mat-select formControlName="condicion">
            @for (c of condiciones; track c.valor) { <mat-option [value]="c.valor">{{ c.etiqueta }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="completo">
          <mat-label>Detalle (opcional)</mat-label>
          <input matInput formControlName="descripcionAdicional" maxlength="255" placeholder="Color, accesorios, número de línea, IMEI. Sale en el acta">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Fecha de compra</mat-label>
          <input matInput type="date" formControlName="fechaCompra" [max]="hoy">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Valor de compra</mat-label>
          <span matTextPrefix>$&nbsp;</span>
          <input matInput formControlName="valorCompra" inputmode="numeric" maxlength="16">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Proveedor</mat-label>
          <mat-select formControlName="proveedorId">
            <mat-option [value]="null">Sin proveedor</mat-option>
            @for (p of proveedores(); track p.id) { <mat-option [value]="p.id">{{ p.nombre }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (!d.activo) {
          <mat-form-field>
            <mat-label>Unidades iguales</mat-label>
            <input matInput type="number" formControlName="cantidad" min="1" max="200">
            <mat-hint>Cada una recibe su propia placa</mat-hint>
            <mat-error>Entre 1 y 200</mat-error>
          </mat-form-field>
        }
        <mat-form-field class="completo">
          <mat-label>Observaciones (opcional)</mat-label>
          <input matInput formControlName="observaciones" maxlength="255">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-activo" [disabled]="guardando()">{{ textoBoton() }}</button>
    </mat-dialog-actions>
  `,
})
export class ActivoDialogo implements OnInit {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<ActivoDialogo>);
  protected readonly d = inject<DatosActivoDialogo>(MAT_DIALOG_DATA);
  protected readonly condiciones = CONDICIONES;
  protected readonly hoy = new Date().toLocaleDateString('en-CA');
  protected readonly proveedores = signal<{ id: number; nombre: string }[]>([]);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly equipos = computed(() => this.tiposVisibles().filter((t) => t.categoria === 'EQUIPO'));
  protected readonly muebles = computed(() => this.tiposVisibles().filter((t) => t.categoria === 'MUEBLE'));

  protected readonly form = inject(FormBuilder).group({
    elementoId: [this.d.activo?.elementoId ?? (this.d.tipos.length === 1 ? this.d.tipos[0].id : null), Validators.required],
    marca: [this.d.activo?.marca ?? ''],
    modelo: [this.d.activo?.modelo ?? ''],
    serial: [this.d.activo?.serial ?? ''],
    condicion: [this.d.activo?.condicion ?? ('NUEVO' as Condicion), Validators.required],
    descripcionAdicional: [this.d.activo?.descripcionAdicional ?? ''],
    fechaCompra: [this.d.activo?.fechaCompra ?? ''],
    valorCompra: [this.d.activo?.valorCompra != null ? this.d.activo.valorCompra.toLocaleString('es-CO') : ''],
    proveedorId: [this.d.activo?.proveedorId ?? (null as number | null)],
    observaciones: [this.d.activo?.observaciones ?? ''],
    cantidad: [1, [Validators.min(1), Validators.max(200)]],
  });

  private readonly cantidad = toSignal(this.form.controls.cantidad.valueChanges, { initialValue: 1 });
  protected readonly variasUnidades = computed(() => Number(this.cantidad()) > 1);
  protected readonly textoBoton = computed(() => {
    if (this.guardando()) return 'Guardando…';
    if (this.d.activo) return 'Guardar cambios';
    const n = Number(this.cantidad()) || 1;
    return n > 1 ? `Registrar ${n} unidades` : 'Registrar';
  });

  /** Al editar solo se ofrecen tipos de la misma categoría, porque la placa depende de ella. */
  private tiposVisibles() {
    return this.d.activo ? this.d.tipos.filter((t) => t.categoria === this.d.activo!.categoria || t.id === this.d.activo!.elementoId) : this.d.tipos;
  }

  async ngOnInit() {
    try {
      this.proveedores.set(await this.api.proveedores());
    } catch {
      // opcional
    }
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const valor = String(v.valorCompra ?? '').replace(/[$\s.]/g, '').replace(',', '.');
    if (valor && !Number.isFinite(Number(valor))) {
      this.error.set('El valor de compra debe ser un número');
      return;
    }
    if (Number(v.cantidad) > 1 && v.serial?.trim()) {
      this.error.set('Con serial se registra una unidad a la vez. Para varias unidades iguales deje el serial vacío');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const datos = {
      elementoId: v.elementoId!,
      serial: v.serial?.trim() || null,
      marca: v.marca?.trim() || null,
      modelo: v.modelo?.trim() || null,
      descripcionAdicional: v.descripcionAdicional?.trim() || null,
      condicion: v.condicion as Condicion,
      fechaCompra: v.fechaCompra || null,
      proveedorId: v.proveedorId ?? null,
      valorCompra: valor ? Number(valor) : null,
      observaciones: v.observaciones?.trim() || null,
    };
    try {
      this.ref.close(this.d.activo
        ? await this.api.editarActivo(this.d.activo.id, datos)
        : await this.api.crearActivo({ ...datos, cantidad: Number(v.cantidad) || 1 }));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
