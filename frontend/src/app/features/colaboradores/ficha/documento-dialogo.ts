import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { mensajeDeError } from '../../../core/autenticacion';
import { ColaboradoresService, type Documento, type Expediente } from '../colaboradores.service';

export interface DatosDocumentoDialogo {
  colaboradorId: number;
  tipos: Expediente['tipos'];
  maxMb: number;
  reemplaza?: Documento;
  tipoInicial?: number;
}

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

@Component({
  selector: 'app-documento-dialogo',
  imports: [DecimalPipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>{{ d.reemplaza ? 'Reemplazar documento' : 'Agregar documento' }}</h2>
    <mat-dialog-content>
      @if (d.reemplaza) {
        <p class="ayuda">La versión actual de "{{ d.reemplaza.tipoDocumento }}" quedará guardada como versión anterior.</p>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" id="form-documento" (ngSubmit)="guardar()" novalidate>
        <mat-form-field>
          <mat-label>Tipo de documento</mat-label>
          <mat-select formControlName="tipoDocumentoId">
            @for (t of d.tipos; track t.id) { <mat-option [value]="t.id">{{ t.nombre }}</mat-option> }
          </mat-select>
          <mat-error>Seleccione el tipo de documento</mat-error>
        </mat-form-field>

        <label class="zona" [class.zona--sobre]="arrastrando()" [class.zona--error]="intentado() && !archivo()"
               (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" (change)="elegir($event)" class="zona__input">
          @if (archivo(); as a) {
            <mat-icon>{{ a.type === 'application/pdf' ? 'picture_as_pdf' : 'image' }}</mat-icon>
            <span class="zona__nombre">{{ a.name }}</span>
            <span class="zona__detalle">{{ a.size < 1048576 ? (a.size / 1024 | number: '1.0-0') + ' KB' : (a.size / 1048576 | number: '1.1-1') + ' MB' }}. Haga clic para cambiarlo</span>
          } @else {
            <mat-icon>upload_file</mat-icon>
            <span class="zona__nombre">Arrastre el archivo aquí o haga clic para buscarlo</span>
            <span class="zona__detalle">PDF, JPG o PNG, máximo {{ d.maxMb }} MB</span>
          }
        </label>

        <mat-form-field>
          <mat-label>Descripción (opcional)</mat-label>
          <input matInput formControlName="descripcion" maxlength="200" autocomplete="off">
          <mat-hint>Por ejemplo: Otrosí de cambio de salario</mat-hint>
        </mat-form-field>
        <div class="fechas">
          <mat-form-field>
            <mat-label>Fecha de expedición</mat-label>
            <input matInput type="date" formControlName="fechaExpedicion">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Fecha de vencimiento{{ manejaVencimiento() ? '' : ' (si aplica)' }}</mat-label>
            <input matInput type="date" formControlName="fechaVencimiento">
            @if (manejaVencimiento()) { <mat-hint>Genera alerta antes de vencer</mat-hint> }
            <mat-error>Este documento necesita fecha de vencimiento</mat-error>
          </mat-form-field>
        </div>
      </form>
      @if (guardando()) { <mat-progress-bar mode="indeterminate" aria-label="Subiendo archivo" /> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="form-documento" [disabled]="guardando()">{{ guardando() ? 'Subiendo…' : 'Guardar documento' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: grid; gap: 12px; padding-top: 8px; }
    mat-form-field { width: 100%; }
    .fechas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ayuda { margin: 0 0 14px; color: var(--sgth-tinta-suave); }
    .error { margin: 0 0 12px; padding: 10px 12px; border-left: 4px solid var(--sgth-error); border-radius: 6px; background: #fdecea; color: var(--sgth-error); font-size: 0.9rem; }
    .zona {
      position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px 16px;
      border: 2px dashed var(--sgth-linea); border-radius: 8px; background: #f8fbfb; text-align: center; cursor: pointer;
      mat-icon { font-size: 32px; width: 32px; height: 32px; color: var(--sgth-petroleo); }
      &:hover, &--sobre { border-color: var(--sgth-petroleo); background: var(--sgth-petroleo-suave); }
      &--error { border-color: var(--sgth-error); }
      &:focus-within { outline: 3px solid var(--sgth-verde); outline-offset: 2px; }
    }
    .zona__input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .zona__nombre { font-weight: 600; word-break: break-all; }
    .zona__detalle { font-size: 0.82rem; color: var(--sgth-tinta-suave); }
    @media (max-width: 520px) { .fechas { grid-template-columns: 1fr; } }
  `,
})
export class DocumentoDialogo {
  private readonly api = inject(ColaboradoresService);
  private readonly ref = inject(MatDialogRef<DocumentoDialogo, boolean>);
  protected readonly d = inject<DatosDocumentoDialogo>(MAT_DIALOG_DATA);
  protected readonly archivo = signal<File | null>(null);
  protected readonly arrastrando = signal(false);
  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    tipoDocumentoId: [this.d.reemplaza?.tipoDocumentoId ?? this.d.tipoInicial ?? null as number | null, Validators.required],
    descripcion: [this.d.reemplaza?.descripcion ?? ''],
    fechaExpedicion: [''],
    fechaVencimiento: [''],
  });

  private readonly tipoId = toSignal(this.form.controls.tipoDocumentoId.valueChanges, { initialValue: this.form.controls.tipoDocumentoId.value });
  protected readonly manejaVencimiento = computed(() => !!this.d.tipos.find((t) => t.id === this.tipoId())?.manejaVencimiento);

  constructor() {
    if (this.d.reemplaza) this.form.controls.tipoDocumentoId.disable();
  }

  elegir(e: Event) {
    const input = e.target as HTMLInputElement;
    this.tomar(input.files?.[0]);
    input.value = '';
  }

  soltar(e: DragEvent) {
    e.preventDefault();
    this.arrastrando.set(false);
    this.tomar(e.dataTransfer?.files?.[0]);
  }

  private tomar(f: File | undefined) {
    if (!f) return;
    this.error.set(null);
    if (!TIPOS_PERMITIDOS.includes(f.type)) return this.error.set('Solo se aceptan archivos PDF, JPG o PNG');
    if (f.size > this.d.maxMb * 1024 * 1024) return this.error.set(`El archivo pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${this.d.maxMb} MB`);
    this.archivo.set(f);
  }

  async guardar() {
    this.intentado.set(true);
    const v = this.form.getRawValue();
    if (this.manejaVencimiento() && !v.fechaVencimiento) this.form.controls.fechaVencimiento.setErrors({ required: true });
    if (this.form.invalid || !this.archivo()) {
      this.form.markAllAsTouched();
      if (!this.archivo()) this.error.set('Seleccione el archivo');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.api.subirDocumento(this.d.colaboradorId, this.archivo()!, {
        tipoDocumentoId: v.tipoDocumentoId,
        descripcion: v.descripcion,
        fechaExpedicion: v.fechaExpedicion,
        fechaVencimiento: v.fechaVencimiento,
        reemplazaAId: this.d.reemplaza?.id ?? null,
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo subir el documento'));
    } finally {
      this.guardando.set(false);
    }
  }
}
