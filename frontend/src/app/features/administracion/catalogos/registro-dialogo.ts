import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { mensajeDeError } from '../../../core/autenticacion';
import { AdministracionService, type CampoCatalogo, type DefinicionCatalogo, type RegistroCatalogo } from '../administracion.service';

export interface DatosRegistroDialogo {
  definicion: DefinicionCatalogo;
  registro?: RegistroCatalogo;
  /** Opciones de los campos de referencia (ej. áreas para un cargo), ya cargadas. */
  referencias: Record<string, { id: number; nombre: string; activo: boolean }[]>;
}

/** Formulario que se arma solo según los campos del catálogo. */
@Component({
  selector: 'app-registro-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ titulo }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="form-registro" (ngSubmit)="guardar()" novalidate>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        @for (c of datos.definicion.campos; track c.columna; let primero = $first) {
          @switch (c.tipo) {
            @case ('booleano') {
              <div class="interruptor">
                <mat-slide-toggle [formControlName]="c.columna">{{ c.etiqueta }}</mat-slide-toggle>
                @if (c.ayuda) { <span class="ayuda">{{ c.ayuda }}</span> }
              </div>
            }
            @case ('opciones') {
              <mat-form-field>
                <mat-label>{{ c.etiqueta }}</mat-label>
                <mat-select [formControlName]="c.columna">
                  @if (!c.requerido) { <mat-option [value]="null">Sin definir</mat-option> }
                  @for (o of c.opciones; track o.valor) {
                    <mat-option [value]="o.valor">{{ o.etiqueta }}</mat-option>
                  }
                </mat-select>
                @if (c.ayuda) { <mat-hint>{{ c.ayuda }}</mat-hint> }
                <mat-error>Seleccione {{ c.etiqueta.toLowerCase() }}</mat-error>
              </mat-form-field>
            }
            @case ('referencia') {
              <mat-form-field>
                <mat-label>{{ c.etiqueta }}</mat-label>
                <mat-select [formControlName]="c.columna">
                  @if (!c.requerido) { <mat-option [value]="null">Sin definir</mat-option> }
                  @for (o of opcionesReferencia(c); track o.id) {
                    <mat-option [value]="o.id">{{ o.nombre }}{{ o.activo ? '' : ' (inactivo)' }}</mat-option>
                  }
                </mat-select>
                @if (!opcionesReferencia(c).length) { <mat-hint>Primero cree registros en el catálogo correspondiente</mat-hint> }
                <mat-error>Seleccione {{ c.etiqueta.toLowerCase() }}</mat-error>
              </mat-form-field>
            }
            @default {
              <mat-form-field>
                <mat-label>{{ c.etiqueta }}{{ c.requerido ? '' : ' (opcional)' }}</mat-label>
                <input matInput [formControlName]="c.columna" [type]="c.tipo === 'numero' ? 'number' : c.formato === 'correo' ? 'email' : 'text'"
                       [attr.maxlength]="c.tipo === 'texto' ? c.maximo : null" autocomplete="off" [attr.cdkFocusInitial]="primero ? '' : null">
                @if (c.ayuda) { <mat-hint>{{ c.ayuda }}</mat-hint> }
                <mat-error>{{ mensajeError(c) }}</mat-error>
              </mat-form-field>
            }
          }
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-registro" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: grid; gap: 14px; padding-top: 8px; }
    mat-form-field { width: 100%; }
    .interruptor { display: flex; flex-direction: column; gap: 2px; padding: 6px 0 14px; }
    .ayuda { padding-left: 52px; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .error { margin: 0 0 12px; padding: 10px 12px; border-left: 4px solid var(--sgth-error); border-radius: 6px; background: #fdecea; color: var(--sgth-error); font-size: 0.9rem; }
  `,
})
export class RegistroDialogo {
  private readonly api = inject(AdministracionService);
  private readonly ref = inject(MatDialogRef<RegistroDialogo, RegistroCatalogo>);
  protected readonly datos = inject<DatosRegistroDialogo>(MAT_DIALOG_DATA);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form: FormGroup;
  protected readonly titulo = `${this.datos.registro ? 'Editar' : 'Agregar'} ${this.datos.definicion.singular.replace(/^(un|una) /, '')}`;

  constructor() {
    const controles: Record<string, FormControl> = {};
    for (const c of this.datos.definicion.campos) {
      const actual = this.datos.registro?.[c.columna];
      const validadores: ValidatorFn[] = [];
      if (c.requerido && c.tipo !== 'booleano') validadores.push(Validators.required);
      if (c.tipo === 'texto' && c.maximo) validadores.push(Validators.maxLength(c.maximo));
      if (c.tipo === 'numero') {
        if (c.minimo !== undefined) validadores.push(Validators.min(c.minimo));
        if (c.maximo !== undefined) validadores.push(Validators.max(c.maximo));
      }
      if (c.formato === 'correo') validadores.push(Validators.email);
      const inicial = c.tipo === 'booleano' ? !!actual : (actual ?? (c.tipo === 'texto' || c.tipo === 'numero' ? '' : null));
      controles[c.columna] = new FormControl(inicial, validadores);
    }
    this.form = inject(FormBuilder).group(controles);
  }

  /** Activos, más el valor actual aunque esté inactivo (para no perderlo al editar). */
  opcionesReferencia(c: CampoCatalogo) {
    const actual = this.datos.registro?.[c.columna];
    return (this.datos.referencias[c.referencia!] ?? []).filter((o) => o.activo || o.id === actual);
  }

  mensajeError(c: CampoCatalogo): string {
    const e = this.form.controls[c.columna].errors ?? {};
    if (e['required']) return `Escriba ${c.etiqueta.toLowerCase()}`;
    if (e['email']) return 'El correo no es válido';
    if (e['min'] || e['max']) return `Debe estar entre ${c.minimo} y ${c.maximo}`;
    if (e['maxlength']) return `Máximo ${c.maximo} caracteres`;
    return 'Valor no válido';
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const clave = this.datos.definicion.clave;
    try {
      const r = this.datos.registro
        ? await this.api.editarRegistro(clave, this.datos.registro.id, this.form.getRawValue())
        : await this.api.crearRegistro(clave, this.form.getRawValue());
      this.ref.close(r);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar'));
    } finally {
      this.guardando.set(false);
    }
  }
}
