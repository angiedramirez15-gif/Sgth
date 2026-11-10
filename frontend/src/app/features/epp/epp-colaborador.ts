import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { SesionService } from '../../core/sesion.service';
import { type EppColaborador as Estado, EppService, ESTADOS_EPP } from '../actas/actas.service';

/** Pestaña "EPP" de la ficha: lo que exige su cargo y el estado de cada elemento. */
@Component({
  selector: 'app-epp-colaborador',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando EPP" />
    } @else if (estado(); as e) {
      <div class="barra">
        <p>Matriz del cargo <strong>{{ e.cargo }}</strong>. Avisa {{ e.diasAlerta }} días antes de cada reposición.</p>
        @if (puedeEntregar && !e.retirado) {
          <a mat-flat-button routerLink="/actas/entrega" [queryParams]="{ tipo: 'EPP', colaborador: colaboradorId() }"><mat-icon>health_and_safety</mat-icon>Entregar EPP</a>
        }
      </div>
      @if (e.epp.length) {
        <div class="sgth-marco">
          <table class="sgth-tabla">
            <thead><tr><th scope="col">EPP</th><th scope="col">Estado</th><th scope="col">Entregado</th><th scope="col">Reposición</th><th scope="col">Acta</th></tr></thead>
            <tbody>
              @for (x of e.epp; track x.elementoId) {
                <tr>
                  <td>{{ x.nombre }}<span class="secundario">{{ x.requerido ? 'Exige ' + x.cantidadRequerida : 'No está en la matriz del cargo' }}{{ x.talla && x.talla !== 'UNICA' ? ', talla ' + x.talla : '' }}</span></td>
                  <td><span [class]="'epp-estado epp-estado--' + x.estado.toLowerCase()">{{ estados[x.estado] }}</span></td>
                  <td>{{ x.entregado ? (x.entregado | date: 'd MMM y') : '—' }}</td>
                  <td>
                    @if (x.reposicion) {
                      {{ x.reposicion | date: 'd MMM y' }}
                      <span class="secundario">{{ x.dias! < 0 ? 'hace ' + -x.dias! + ' días' : x.dias === 0 ? 'hoy' : 'en ' + x.dias + ' días' }}</span>
                    } @else { — }
                  </td>
                  <td>@if (x.actaId) { <a class="numero" [routerLink]="['/actas', x.actaId]">{{ x.acta }}</a> } @else { — }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="sgth-vacio">Su cargo no exige EPP y no ha recibido ninguno. <a routerLink="/epp" [queryParams]="{ ver: 'matriz' }">Ver la matriz por cargo</a></p>
      }
    }
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; p { margin: 0; color: var(--sgth-tinta-suave); } }
    .secundario { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .numero { color: var(--sgth-petroleo); font-weight: 700; font-variant-numeric: tabular-nums; text-decoration: none; }
    .epp-estado { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.78rem; font-weight: 600; }
    .epp-estado--vigente { background: #e6f6ea; color: var(--sgth-verde-texto); }
    .epp-estado--por_vencer { background: var(--sgth-ambar-fondo); color: #6b4100; }
    .epp-estado--vencido { background: #fdecea; color: var(--sgth-error); }
    .epp-estado--sin_entregar { background: #eef2f3; color: var(--sgth-tinta-suave); }
  `,
})
export class EppColaborador implements OnInit {
  readonly colaboradorId = input.required<number>();
  private readonly api = inject(EppService);
  protected readonly puedeEntregar = inject(SesionService).puede('actas_epp.gestionar');
  protected readonly estados = ESTADOS_EPP;
  protected readonly estado = signal<Estado | null>(null);
  protected readonly cargando = signal(true);

  async ngOnInit() {
    try {
      this.estado.set(await this.api.estado(this.colaboradorId()));
    } catch {
      // la pestaña queda vacía
    } finally {
      this.cargando.set(false);
    }
  }
}
