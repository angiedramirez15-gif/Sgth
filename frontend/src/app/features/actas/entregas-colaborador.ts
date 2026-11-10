import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { SesionService } from '../../core/sesion.service';
import { ActasService, ESTADOS_ACTA, type FilaActa, type Tenencia } from './actas.service';

const NOMBRES: Record<string, string> = { DOTACION: 'Dotación', EPP: 'EPP', EQUIPOS: 'Equipos', MUEBLES: 'Muebles', OTROS: 'Otros', DEVOLUCION: 'Devolución' };

/** Pestaña "Entregas" de la ficha: lo que tiene a cargo y sus actas. */
@Component({
  selector: 'app-entregas-colaborador',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando entregas" />
    } @else {
      <div class="barra">
        <p class="barra__texto">
          @if (totalACargo()) { Tiene {{ totalACargo() }} elemento{{ totalACargo() === 1 ? '' : 's' }} a cargo. } @else { No tiene elementos a cargo. }
        </p>
        <div class="barra__acciones">
          @if (puedeDevolver && totalACargo()) {
            <a mat-stroked-button routerLink="/actas/devolucion" [queryParams]="{ colaborador: colaboradorId() }"><mat-icon>assignment_return</mat-icon>Registrar devolución</a>
          }
          @if (puedeEntregar && !retirado()) {
            <a mat-flat-button routerLink="/actas/entrega" [queryParams]="{ colaborador: colaboradorId() }"><mat-icon>add</mat-icon>Nueva entrega</a>
          }
        </div>
      </div>

      @if (retirado() && totalACargo()) {
        <p class="alerta"><mat-icon>warning</mat-icon>Está retirado y todavía tiene elementos a cargo. Registre la devolución para su paz y salvo.</p>
      }

      <div class="columnas">
        <section class="bloque" aria-labelledby="t-cargo">
          <h3 id="t-cargo">A cargo ahora</h3>
          @if (tenencia()?.activos?.length || tenencia()?.cantidades?.length) {
            <ul class="lista">
              @for (a of tenencia()!.activos; track a.id) {
                <li>
                  <a class="placa" [routerLink]="['/equipos/activos', a.id]">{{ a.placa }}</a>
                  <span class="lista__texto">{{ a.elemento }}<span class="secundario">{{ [a.marca, a.modelo].join(' ').trim() }}</span></span>
                  @if (a.actaId) { <a class="lista__acta" [routerLink]="['/actas', a.actaId]">{{ a.acta }}</a> }
                </li>
              }
              @for (c of tenencia()!.cantidades; track c.elementoId + c.talla) {
                <li>
                  <span class="cantidad sgth-cifra">{{ c.cantidad }}</span>
                  <span class="lista__texto">{{ c.elemento }}<span class="secundario">{{ c.talla !== 'UNICA' ? 'Talla ' + c.talla : c.unidad }}</span></span>
                </li>
              }
            </ul>
          } @else {
            <p class="vacio">Nada a cargo.</p>
          }
          @if (tenencia()?.dotacion?.length) {
            <h3 class="sub">Dotación recibida</h3>
            <ul class="periodos">
              @for (d of tenencia()!.dotacion; track d.actaId) {
                <li><a [routerLink]="['/actas', d.actaId]">Período {{ d.numero }} de {{ d.anio }}</a></li>
              }
            </ul>
          }
        </section>

        <section class="bloque" aria-labelledby="t-actas">
          <h3 id="t-actas">Actas</h3>
          @if (actas().length) {
            <ul class="actas">
              @for (a of actas(); track a.id) {
                <li [class.anulada]="a.estado === 'ANULADA'">
                  <a class="actas__numero" [routerLink]="['/actas', a.id]">{{ a.consecutivo }}</a>
                  <span class="actas__texto">{{ nombres[a.plantilla] }}{{ a.motivo === 'TRASPASO' ? ' (traspaso)' : '' }}, {{ a.fecha | date: 'd MMM y' }}<span class="secundario">{{ a.resumen }}</span></span>
                  <span class="sgth-estado" [class.sgth-estado--alerta]="a.estado === 'PENDIENTE_ACTA'" [class.sgth-estado--activo]="a.estado === 'COMPLETA'" [class.sgth-estado--inactivo]="a.estado === 'ANULADA'">{{ estados[a.estado] }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="vacio">Aún no tiene actas.</p>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .barra__texto { margin: 0; color: var(--sgth-tinta-suave); }
    .barra__acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .alerta { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; padding: 10px 14px; border-radius: 6px; background: var(--sgth-ambar-fondo); color: #6b4100; }
    .columnas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; align-items: start; }
    .bloque { padding: 18px 20px; background: var(--sgth-superficie); border: 1px solid var(--sgth-linea); border-radius: 8px; }
    h3 { margin: 0 0 12px; font-size: 1rem; }
    .sub { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--sgth-linea); }
    .lista, .actas, .periodos { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .lista li, .actas li { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; }
    .actas li { grid-template-columns: 124px minmax(0, 1fr) auto; }
    .placa, .actas__numero { color: var(--sgth-petroleo); font-weight: 700; font-variant-numeric: tabular-nums; text-decoration: none; white-space: nowrap; }
    .cantidad { text-align: right; padding-right: 30px; }
    .secundario { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
    .lista__acta { font-size: 0.8rem; white-space: nowrap; }
    .actas li.anulada .actas__numero { color: #8a9a9d; text-decoration: line-through; }
    .periodos { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .vacio { margin: 0; color: var(--sgth-tinta-suave); }
    @media (max-width: 860px) { .columnas { grid-template-columns: 1fr; } }
  `,
})
export class EntregasColaborador implements OnInit {
  readonly colaboradorId = input.required<number>();
  readonly retirado = input(false);
  readonly total = output<number>();

  private readonly api = inject(ActasService);
  private readonly sesion = inject(SesionService);
  protected readonly puedeEntregar = this.sesion.puede('actas_dotacion.gestionar', 'actas_activos.gestionar');
  protected readonly puedeDevolver = this.sesion.puede('actas_activos.gestionar');
  protected readonly estados = ESTADOS_ACTA;
  protected readonly nombres = NOMBRES;

  protected readonly cargando = signal(true);
  protected readonly tenencia = signal<Tenencia | null>(null);
  protected readonly actas = signal<FilaActa[]>([]);
  protected readonly totalACargo = computed(() => {
    const t = this.tenencia();
    return t ? t.activos.length + t.cantidades.reduce((s, c) => s + c.cantidad, 0) : 0;
  });

  async ngOnInit() {
    try {
      const [t, a] = await Promise.all([this.api.tenencia(this.colaboradorId()), this.api.listar(this.colaboradorId())]);
      this.tenencia.set(t);
      this.actas.set(a);
      this.total.emit(this.totalACargo());
    } catch {
      // La pestaña muestra vacío; el resto de la ficha sigue funcionando
    } finally {
      this.cargando.set(false);
    }
  }
}
