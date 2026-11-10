import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SesionService } from '../../core/sesion.service';
import { AvisosService } from '../../shared/avisos.service';
import { EppService, ESTADOS_ACTA, type Planilla } from '../actas/actas.service';
import { mensajeDeErrorBlob } from '../administracion/plantillas/plantillas';
import { abrirPdf } from '../inventario/inventario.service';

@Component({
  selector: 'app-planilla-detalle',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="sgth-pagina detalle">
      <a class="volver" routerLink="/epp" [queryParams]="{ ver: 'planillas' }"><mat-icon>arrow_back</mat-icon>Planillas</a>
      @if (cargando()) {
        <mat-progress-bar mode="indeterminate" aria-label="Cargando" />
      } @else if (planilla(); as p) {
        @if (nueva && !p.firmada) {
          <section class="siguiente">
            <h2><mat-icon>check_circle</mat-icon>Entrega grupal registrada con la planilla {{ p.consecutivo }}</h2>
            <ol>
              <li><button mat-flat-button (click)="verPdf()"><mat-icon>print</mat-icon>Abrir la planilla e imprimir</button></li>
              <li>Cada persona firma en su fila</li>
              <li>Escanearla y subirla aquí</li>
            </ol>
          </section>
        }
        <header class="cabecera">
          <div>
            <p class="cabecera__tipo">Entrega grupal de EPP, {{ p.motivoTexto.toLowerCase() }}</p>
            <h1 class="cabecera__numero">{{ p.consecutivo }}</h1>
            <p class="cabecera__estado">
              <span class="sgth-estado" [class.sgth-estado--activo]="p.firmada" [class.sgth-estado--alerta]="!p.firmada">{{ p.firmada ? 'Firmada' : 'Falta la firmada' }}</span>
              <span class="secundario">{{ p.fecha | date: 'd MMM y' }}, registró {{ p.registradaPor }}</span>
            </p>
          </div>
          <div class="cabecera__acciones">
            <button mat-stroked-button (click)="verPdf()"><mat-icon>picture_as_pdf</mat-icon>Planilla para imprimir</button>
            @if (p.firmada) { <button mat-stroked-button (click)="verFirmada()"><mat-icon>verified</mat-icon>Ver firmada</button> }
            @if (puedeGestionar) {
              <label class="subir" [class.subir--ocupado]="subiendo()">
                <input type="file" accept="application/pdf,image/jpeg,image/png" (change)="subir($event)" [disabled]="subiendo()">
                <mat-icon>upload_file</mat-icon>{{ subiendo() ? 'Subiendo…' : p.firmada ? 'Reemplazar firmada' : 'Subir firmada' }}
              </label>
            }
          </div>
        </header>
        @if (p.observaciones) { <p class="obs">{{ p.observaciones }}</p> }

        <section class="bloque">
          <h2>{{ p.personas.length }} personas</h2>
          <p class="secundario">Si alguien no firmó, anule solo su acta desde el número: los demás no cambian.</p>
          <div class="sgth-marco">
            <table class="sgth-tabla">
              <thead><tr><th scope="col">Persona</th><th scope="col">EPP</th><th scope="col">Reposición</th><th scope="col">Acta</th></tr></thead>
              <tbody>
                @for (a of p.personas; track a.id) {
                  <tr [class.inactivo]="a.estado === 'ANULADA'">
                    <td><a [routerLink]="['/colaboradores', a.colaboradorId]">{{ a.colaborador }}</a><span class="secundario">{{ a.documento }}, {{ a.cargo }}</span></td>
                    <td>@for (l of a.lineas; track $index) { <span class="linea">{{ l.cantidad }} {{ l.unidad.toLowerCase() }} {{ l.epp }}{{ l.talla !== 'UNICA' ? ' (' + l.talla + ')' : '' }}</span> }</td>
                    <td>@for (l of a.lineas; track $index) { <span class="linea">{{ l.reposicion | date: 'd MMM y' }}</span> }</td>
                    <td>
                      <a class="numero" [routerLink]="['/actas', a.id]">{{ a.consecutivo }}</a>
                      <span class="sgth-estado" [class.sgth-estado--activo]="a.estado === 'COMPLETA'" [class.sgth-estado--alerta]="a.estado === 'PENDIENTE_ACTA'" [class.sgth-estado--inactivo]="a.estado === 'ANULADA'">{{ estados[a.estado] }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .detalle { max-width: 1080px; }
    .volver { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px; font-size: 0.9rem; text-decoration: none; mat-icon { font-size: 18px; width: 18px; height: 18px; } }
    .siguiente { margin-bottom: 14px; padding: 16px 20px; border-radius: 8px; background: var(--sgth-petroleo); color: #fff;
      h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 1.05rem; color: #fff; mat-icon { color: var(--sgth-verde); } }
      ol { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 28px; margin: 0; padding-left: 20px; }
      li::marker { color: var(--sgth-verde); font-weight: 700; }
      button { --mat-button-filled-container-color: var(--sgth-verde); --mat-button-filled-label-text-color: var(--sgth-petroleo-profundo); } }
    .cabecera { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px; background: var(--sgth-superficie); border: 1px solid var(--sgth-linea); border-top: 4px solid var(--sgth-petroleo); border-radius: 8px; }
    .cabecera__tipo { margin: 0; color: var(--sgth-tinta-suave); }
    .cabecera__numero { margin: 2px 0 6px; color: var(--sgth-petroleo); font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .cabecera__estado { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0; }
    .cabecera__acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .subir { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 20px 0 16px; border-radius: 20px; background: var(--sgth-petroleo); color: #fff; font-weight: 500; font-size: 0.875rem; cursor: pointer;
      input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } mat-icon { font-size: 18px; width: 18px; height: 18px; }
      &:hover { background: var(--sgth-petroleo-profundo); } &:focus-within { outline: 3px solid var(--sgth-verde); outline-offset: 1px; } &--ocupado { opacity: 0.7; cursor: wait; } }
    .obs { margin: 12px 0 0; color: var(--sgth-tinta-suave); }
    .bloque { margin-top: 16px; padding: 18px 20px; background: var(--sgth-superficie); border: 1px solid var(--sgth-linea); border-radius: 8px; h2 { margin: 0 0 4px; font-size: 1rem; } > .secundario { margin: 0 0 12px; } }
    .secundario { display: block; font-size: 0.82rem; color: var(--sgth-tinta-suave); }
    .linea { display: block; }
    .numero { display: block; color: var(--sgth-petroleo); font-weight: 700; font-variant-numeric: tabular-nums; text-decoration: none; }
  `,
})
export class PlanillaDetalle implements OnInit {
  readonly id = input.required<string>();
  private readonly api = inject(EppService);
  private readonly avisos = inject(AvisosService);
  protected readonly puedeGestionar = inject(SesionService).puede('actas_epp.gestionar');
  protected readonly nueva = inject(ActivatedRoute).snapshot.queryParamMap.get('nueva') === '1';
  protected readonly estados = ESTADOS_ACTA;
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly cargando = signal(true);
  protected readonly subiendo = signal(false);

  async ngOnInit() {
    try {
      this.planilla.set(await this.api.planilla(Number(this.id())));
    } catch (e) {
      this.avisos.error(e, 'No se pudo cargar la planilla');
    } finally {
      this.cargando.set(false);
    }
  }

  async verPdf() {
    const p = this.planilla()!;
    try {
      await abrirPdf(() => this.api.pdfPlanilla(p.id), `${p.consecutivo}.pdf`);
    } catch (e) {
      this.avisos.error(null, await mensajeDeErrorBlob(e));
    }
  }

  async verFirmada() {
    const p = this.planilla()!;
    try {
      await abrirPdf(() => this.api.firmadaPlanilla(p.id), `${p.consecutivo}_firmada.pdf`);
    } catch (e) {
      this.avisos.error(null, await mensajeDeErrorBlob(e));
    }
  }

  async subir(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    this.subiendo.set(true);
    try {
      this.planilla.set(await this.api.subirPlanilla(this.planilla()!.id, archivo));
      this.avisos.exito('Planilla firmada guardada: todas las entregas quedaron completas');
    } catch (e) {
      this.avisos.error(e, 'No se pudo subir el archivo');
    } finally {
      this.subiendo.set(false);
    }
  }
}
