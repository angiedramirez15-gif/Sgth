import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { mensajeDeError } from '../../../core/autenticacion';
import { abrirPdf, type Activo, InventarioService } from '../inventario.service';

const POR_HOJA = 30;

/** Elegir desde qué etiqueta empezar en la hoja carta de 10 y abrir el PDF. */
@Component({
  selector: 'app-stickers-dialogo',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>Imprimir {{ activos.length === 1 ? 'sticker de ' + activos[0].placa : activos.length + ' stickers' }}</h2>
    <mat-dialog-content>
      <div class="cuerpo">
        <div>
          <p class="sgth-ayuda">Hoja carta de etiquetas adhesivas de 6,7 × 2,5 cm, 30 por hoja (tipo Avery 5160). Si ya usó parte de una hoja, toque la primera etiqueta libre.</p>
          <p class="calculo">
            {{ hojas() === 1 ? 'Cabe en 1 hoja' : 'Usa ' + hojas() + ' hojas' }}.
            @if (posicion() > 1) { Empieza en la etiqueta {{ posicion() }}. }
          </p>
          <mat-checkbox [(ngModel)]="bordes">
            Dibujar el borde de cada etiqueta
            <span class="pista">Para imprimir en papel normal y recortar</span>
          </mat-checkbox>
          <p class="consejo">Al imprimir, escoja <strong>tamaño real</strong> o escala 100 %, no "ajustar a la página".</p>
        </div>
        <div class="hoja" role="radiogroup" aria-label="Primera etiqueta a usar">
          @for (n of posiciones; track n) {
            <button type="button" role="radio" class="etiqueta"
              [attr.aria-checked]="posicion() === n" [attr.aria-label]="'Empezar en la etiqueta ' + n"
              [class.etiqueta--usada]="n < posicion()" [class.etiqueta--llena]="n >= posicion() && n < posicion() + activos.length"
              (click)="posicion.set(n)">
              {{ n < posicion() ? '' : n }}
            </button>
          }
        </div>
      </div>
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="button" (click)="abrir()" [disabled]="abriendo()">{{ abriendo() ? 'Generando…' : 'Abrir PDF para imprimir' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .cuerpo { display: grid; grid-template-columns: 1fr 170px; gap: 24px; align-items: start; }
    .calculo { margin: 0 0 14px; font-weight: 600; }
    .pista { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .consejo { margin: 16px 0 0; font-size: 0.85rem; color: var(--sgth-tinta-suave); }
    /* Miniatura de la hoja carta: proporción 8,5 × 11 */
    .hoja {
      display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(10, 1fr); gap: 2px 3px;
      aspect-ratio: 8.5 / 11; padding: 9px 3px; border: 1px solid var(--sgth-linea); border-radius: 3px; background: #fff;
      box-shadow: 0 1px 2px rgb(9 66 77 / 12%);
    }
    .etiqueta {
      border: 1px dashed #b8c4c7; border-radius: 4px; background: #fff; color: var(--sgth-tinta-suave);
      font: inherit; font-size: 0.62rem; line-height: 1; padding: 0; cursor: pointer;
    }
    .etiqueta:hover { border-color: var(--sgth-petroleo); }
    .etiqueta:focus-visible { outline: 2px solid var(--sgth-petroleo); outline-offset: 1px; }
    .etiqueta--usada { background: repeating-linear-gradient(135deg, #eef2f3 0 4px, #fff 4px 8px); border-style: solid; }
    .etiqueta--llena { border: 1px solid var(--sgth-petroleo); background: var(--sgth-petroleo-suave); color: var(--sgth-petroleo-profundo); font-weight: 700; }
    @media (max-width: 520px) { .cuerpo { grid-template-columns: 1fr; } .hoja { max-width: 170px; } }
  `,
})
export class StickersDialogo {
  private readonly api = inject(InventarioService);
  private readonly ref = inject(MatDialogRef<StickersDialogo>);
  protected readonly activos = inject<Activo[]>(MAT_DIALOG_DATA);
  protected readonly posiciones = Array.from({ length: POR_HOJA }, (_, i) => i + 1);
  protected readonly posicion = signal(1);
  protected bordes = false;
  protected readonly abriendo = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hojas = computed(() => Math.ceil((this.posicion() - 1 + this.activos.length) / POR_HOJA));

  async abrir() {
    this.abriendo.set(true);
    this.error.set(null);
    try {
      await abrirPdf(() => this.api.stickers(this.activos.map((a) => a.id), this.posicion(), this.bordes), 'Stickers_placas_SGTH.pdf');
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo generar el PDF'));
    } finally {
      this.abriendo.set(false);
    }
  }
}
