import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { SesionService } from '../../core/sesion.service';

/** El usuario lee y acepta el compromiso de confidencialidad (Ley 1581) antes de usar el sistema. */
@Component({
  selector: 'app-compromiso',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="pagina">
      <div class="panel">
        <img class="panel__logo" src="marca/logo-drim-duit.png" alt="DRIM DUIT" width="140" height="60">
        <h1>Compromiso de confidencialidad</h1>
        <p class="ayuda">
          Hola, {{ nombre() }}. En el SGTH hay datos personales y sensibles de los colaboradores.
          Antes de continuar, lea y acepte este compromiso.
          @if (texto(); as t) { <span class="version">Versión {{ t.version }}.</span> }
        </p>

        @if (!texto() && !error()) {
          <mat-progress-bar mode="indeterminate" aria-label="Cargando el compromiso" />
        }
        @if (error()) {
          <p class="aviso" role="alert"><mat-icon>error</mat-icon>{{ error() }}</p>
        }
        @if (texto(); as t) {
          <div class="texto" tabindex="0" role="document" aria-label="Texto del compromiso">{{ t.texto }}</div>
          <mat-checkbox [(ngModel)]="leido">He leído el compromiso y me obligo a cumplirlo</mat-checkbox>
        }

        <div class="acciones">
          <button mat-button type="button" (click)="salir()">Cerrar sesión</button>
          <button mat-flat-button type="button" (click)="aceptar()" [disabled]="!texto() || !leido || enviando()">
            {{ enviando() ? 'Guardando…' : 'Aceptar y continuar' }}
          </button>
        </div>
        <p class="nota">Se guardará la fecha, la hora y el equipo desde el que aceptó.</p>
      </div>
    </div>
  `,
  styleUrl: '../cambiar-clave/cambiar-clave.scss',
  styles: `
    .panel { max-width: 640px; }
    .version { white-space: nowrap; }
    .texto {
      max-height: 46vh;
      overflow: auto;
      margin: 0 0 16px;
      padding: 16px 18px;
      border: 1px solid var(--sgth-linea);
      border-radius: 6px;
      background: #f8fafa;
      white-space: pre-line;
      line-height: 1.55;
      font-size: 0.93rem;
      &:focus-visible { outline: 2px solid var(--sgth-petroleo); outline-offset: 2px; }
    }
    .acciones { margin-top: 20px; }
    .nota { margin: 12px 0 0; font-size: 0.8rem; color: var(--sgth-tinta-suave); }
  `,
})
export class Compromiso implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly nombre = computed(() => this.sesion.usuario()?.nombre ?? '');
  protected readonly texto = signal<{ id: number; version: number; texto: string } | null>(null);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected leido = false;

  async ngOnInit() {
    try {
      const t = await this.sesion.compromiso();
      if (!t) {
        await this.router.navigate(['/']);
        return;
      }
      this.texto.set(t);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el compromiso'));
    }
  }

  async aceptar() {
    const t = this.texto();
    if (!t || !this.leido) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.sesion.aceptarCompromiso(t.id);
      await this.router.navigate([this.sesion.destino()]);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar la aceptación'));
    } finally {
      this.enviando.set(false);
    }
  }

  salir() {
    this.sesion.salir();
  }
}
