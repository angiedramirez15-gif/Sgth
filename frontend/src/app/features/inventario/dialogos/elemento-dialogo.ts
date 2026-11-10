import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { mensajeDeError } from '../../../core/autenticacion';
import { CATEGORIAS, type Categoria, type Elemento, InventarioService } from '../inventario.service';

export interface DatosElementoDialogo {
  /** Categorías entre las que se puede escoger (una sola = fija). */
  categorias: Categoria[];
  elemento?: Elemento;
}

@Component({
  selector: 'app-elemento-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ d.elemento ? 'Editar ' + d.elemento.nombre : 'Nuevo ' + textos().singular }}</h2>
    <mat-dialog-content>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-elemento" (ngSubmit)="guardar()" class="sgth-dialogo-form sgth-dialogo-form--dos" novalidate>
        @if (d.categorias.length > 1 && !d.elemento) {
          <div class="completo selector">
            <span id="cat-etiqueta">Es un</span>
            <mat-button-toggle-group formControlName="categoria" aria-labelledby="cat-etiqueta" hideSingleSelectionIndicator>
              @for (c of d.categorias; track c) { <mat-button-toggle [value]="c">{{ cat[c].singular }}</mat-button-toggle> }
            </mat-button-toggle-group>
          </div>
        }
        <mat-form-field class="completo">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="nombre" maxlength="150" [placeholder]="textos().ejemplo" cdkFocusInitial>
          <mat-error>Escriba el nombre</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Grupo (opcional)</mat-label>
          <input matInput formControlName="subcategoria" maxlength="80" [placeholder]="grupoEjemplo()">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Unidad en el acta</mat-label>
          <input matInput formControlName="unidad" maxlength="20" placeholder="Und, Par, Juego">
          <mat-error>Escriba la unidad</mat-error>
        </mat-form-field>
        @if (form.controls.categoria.value === 'EPP') {
          <mat-form-field>
            <mat-label>Vida útil</mat-label>
            <input matInput type="number" formControlName="vidaUtilDias" min="1" max="3650">
            <span matTextSuffix>días</span>
            <mat-error>Indique la vida útil en días</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Norma o certificación (opcional)</mat-label>
            <input matInput formControlName="normaCertificacion" maxlength="150" placeholder="ANSI Z89.1">
          </mat-form-field>
        }
        @if (!porUnidad()) {
          <mat-form-field>
            <mat-label>Stock mínimo (opcional)</mat-label>
            <input matInput type="number" formControlName="stockMinimo" min="0">
            <mat-hint>Para avisar cuando quede poco</mat-hint>
          </mat-form-field>
        }
        @if (textos().tallas) {
          <mat-checkbox formControlName="manejaTallas" class="completo">
            Se entrega por tallas
            <span class="pista">El stock se lleva por talla y la entrega pide la talla</span>
          </mat-checkbox>
        }
        @if (porUnidad()) {
          <p class="completo sgth-ayuda">Cada unidad se registra después con su serial y el sistema le asigna una placa.</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-elemento" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : d.elemento ? 'Guardar cambios' : 'Agregar al catálogo' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .selector { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; color: var(--sgth-tinta-suave); }
    .pista { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    mat-checkbox { margin: 4px 0 8px; }
  `,
})
export class ElementoDialogo {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<ElementoDialogo>);
  protected readonly d = inject<DatosElementoDialogo>(MAT_DIALOG_DATA);
  protected readonly cat = CATEGORIAS;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    categoria: [this.d.elemento?.categoria ?? this.d.categorias[0], Validators.required],
    nombre: [this.d.elemento?.nombre ?? '', [Validators.required, Validators.maxLength(150)]],
    subcategoria: [this.d.elemento?.subcategoria ?? ''],
    unidad: [this.d.elemento?.unidad ?? 'Und', Validators.required],
    manejaTallas: [this.d.elemento?.manejaTallas ?? false],
    normaCertificacion: [this.d.elemento?.normaCertificacion ?? ''],
    vidaUtilDias: [this.d.elemento?.vidaUtilDias ?? (null as number | null)],
    stockMinimo: [this.d.elemento?.stockMinimo ?? (null as number | null)],
  });

  protected textos() {
    return CATEGORIAS[this.form.controls.categoria.value as Categoria];
  }

  protected porUnidad() {
    const c = this.form.controls.categoria.value;
    return c === 'EQUIPO' || c === 'MUEBLE';
  }

  protected grupoEjemplo() {
    const ejemplos: Record<Categoria, string> = {
      DOTACION: 'Uniforme, calzado', EPP: 'Cabeza, manos, pies', EQUIPO: 'Cómputo, comunicaciones', MUEBLE: 'Oficina, bodega', OTRO: 'Accesos, papelería',
    };
    return ejemplos[this.form.controls.categoria.value as Categoria];
  }

  async guardar() {
    const v = this.form.getRawValue();
    if (v.categoria === 'EPP' && !v.vidaUtilDias) this.form.controls.vidaUtilDias.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const datos = {
      categoria: v.categoria as Categoria,
      nombre: v.nombre!.trim(),
      subcategoria: v.subcategoria?.trim() || null,
      unidad: v.unidad!.trim(),
      manejaTallas: !!v.manejaTallas,
      normaCertificacion: v.normaCertificacion?.trim() || null,
      vidaUtilDias: v.vidaUtilDias || null,
      stockMinimo: v.stockMinimo ?? null,
    };
    try {
      this.ref.close(this.d.elemento ? await this.api.editarElemento(this.d.elemento.id, datos) : await this.api.crearElemento(datos));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
