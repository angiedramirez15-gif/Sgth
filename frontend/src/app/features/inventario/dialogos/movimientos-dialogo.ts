import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { mensajeDeError } from '../../../core/autenticacion';
import { type Elemento, InventarioService, type Movimiento, TIPOS_MOVIMIENTO } from '../inventario.service';

const SUMAN = new Set(['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO', 'ANULACION']);

@Component({
  selector: 'app-movimientos-dialogo',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Movimientos de {{ e.nombre }}</h2>
    <mat-dialog-content>
      @if (cargando()) { <mat-progress-bar mode="indeterminate" aria-label="Cargando movimientos" /> }
      @if (error()) { <p class="sgth-error-caja" role="alert">{{ error() }}</p> }
      @if (!cargando() && !error()) {
        @if (filas().length) {
          <div class="sgth-marco">
            <table class="sgth-tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Movimiento</th>
                  @if (e.manejaTallas) { <th scope="col">Talla</th> }
                  <th scope="col" class="num">Cantidad</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                @for (m of filas(); track m.id) {
                  <tr>
                    <td>{{ m.fecha.replace(' ', 'T') | date: 'd MMM y, h:mm a' }}<span class="secundario">{{ m.usuario }}</span></td>
                    <td>{{ tipos[m.tipo] ?? m.tipo }}</td>
                    @if (e.manejaTallas) { <td>{{ m.talla }}</td> }
                    <td class="num sgth-cifra" [class.suma]="suma(m)" [class.resta]="!suma(m)">{{ suma(m) ? '+' : '−' }}{{ m.cantidad }}</td>
                    <td class="detalle">
                      @if (m.acta) { <span>Acta {{ m.acta }}</span> }
                      @if (m.proveedor) { <span>{{ m.proveedor }}</span> }
                      @if (m.numeroFactura) { <span>Factura {{ m.numeroFactura }}</span> }
                      @if (m.observacion) { <span class="secundario">{{ m.observacion }}</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="sgth-vacio">Aún no tiene movimientos. Registre una entrada para empezar a llevar su stock.</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .num { text-align: right; }
    .suma { color: var(--sgth-verde-texto); }
    .resta { color: var(--sgth-error); }
    .detalle span:not(.secundario) + span:not(.secundario)::before { content: ', '; }
  `,
})
export class MovimientosDialogo implements OnInit {
  private readonly api = inject(InventarioService);
  protected readonly e = inject<Elemento>(MAT_DIALOG_DATA);
  protected readonly tipos = TIPOS_MOVIMIENTO;
  protected readonly filas = signal<Movimiento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.filas.set(await this.api.movimientos(this.e.id));
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudieron cargar los movimientos'));
    } finally {
      this.cargando.set(false);
    }
  }

  suma(m: Movimiento) {
    return SUMAN.has(m.tipo);
  }
}
