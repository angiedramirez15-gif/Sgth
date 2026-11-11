import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvisosService } from '../../shared/avisos.service';
import { abrirPdf } from '../inventario/inventario.service';
import { type Certificado, CertificadosService } from './certificados.service';

/** Pestaña "Certificados" de la ficha: los certificados laborales expedidos. */
@Component({
  selector: 'app-certificados-colaborador',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <div class="barra">
      <p>Cada certificado queda guardado con su número. Se genera con los datos de la ficha del día en que se expide.</p>
      <button mat-flat-button type="button" (click)="generar.emit()"><mat-icon>description</mat-icon>Generar certificado</button>
    </div>
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando certificados" />
    } @else if (lista().length) {
      <div class="sgth-marco">
        <table class="sgth-tabla">
          <thead>
            <tr><th scope="col">Número</th><th scope="col">Expedido</th><th scope="col">Dirigido a</th><th scope="col">Salario</th><th scope="col">Cargo y contrato</th><th scope="col">Generó</th><th scope="col"><span class="lector">PDF</span></th></tr>
          </thead>
          <tbody>
            @for (k of lista(); track k.id) {
              <tr>
                <td class="numero">{{ k.consecutivo }}</td>
                <td>{{ k.fechaExpedicion | date: 'd MMM y' }}</td>
                <td>{{ k.dirigidoA ?? 'A quien interese' }}</td>
                <td>{{ k.conSalario ? 'Con salario' : 'Sin salario' }}</td>
                <td>{{ k.cargo }}<span class="secundario">{{ k.tipoContrato }}</span></td>
                <td>{{ k.creadoPor }}<span class="secundario">{{ k.creadoEn.replace(' ', 'T') | date: 'd MMM y, h:mm a' }}</span></td>
                <td class="accion">
                  <button mat-button type="button" (click)="ver(k)" [attr.aria-label]="'Ver PDF del certificado ' + k.consecutivo"><mat-icon>picture_as_pdf</mat-icon>Ver PDF</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="sgth-vacio">Todavía no se ha expedido ningún certificado laboral.</p>
    }
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; p { margin: 0; color: var(--sgth-tinta-suave); } }
    .secundario { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .numero { color: var(--sgth-petroleo); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .accion { text-align: right; }
    .lector { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  `,
})
export class CertificadosColaborador {
  readonly colaboradorId = input.required<number>();
  /** Cambia cada vez que se expide uno nuevo, para recargar la lista. */
  readonly version = input(0);
  readonly generar = output<void>();

  private readonly api = inject(CertificadosService);
  private readonly avisos = inject(AvisosService);
  protected readonly lista = signal<Certificado[]>([]);
  protected readonly cargando = signal(true);

  constructor() {
    effect(() => {
      this.version();
      this.cargar(this.colaboradorId());
    });
  }

  private async cargar(id: number) {
    try {
      this.lista.set(await this.api.listar(id));
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.cargando.set(false);
    }
  }

  async ver(k: Certificado) {
    try {
      await abrirPdf(() => this.api.pdf(k.id), `${k.consecutivo}.pdf`);
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
