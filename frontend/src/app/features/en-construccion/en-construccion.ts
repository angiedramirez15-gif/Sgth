import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { OpcionMenu } from '../../core/menu';

/** Pantalla provisional para los módulos que aún no se construyen. */
@Component({
  selector: 'app-en-construccion',
  imports: [RouterLink, MatIconModule, MatButtonModule],
  template: `
    @if (modulo(); as m) {
      <div class="vacio">
        <span class="vacio__icono"><mat-icon>{{ m.icono }}</mat-icon></span>
        <h1>{{ m.titulo }}</h1>
        <p>{{ m.descripcion }}</p>
        <p class="vacio__fase">Este módulo se construye en la fase {{ m.fase }} del plan de trabajo.</p>
        <a mat-stroked-button routerLink="/">Volver al inicio</a>
      </div>
    }
  `,
  styles: `
    .vacio { max-width: 520px; padding: 40px 0; }
    .vacio__icono {
      display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: 20px;
      border-radius: 8px; background: var(--sgth-petroleo-suave); color: var(--sgth-petroleo);
      mat-icon { font-size: 30px; width: 30px; height: 30px; }
    }
    h1 { margin-bottom: 8px; }
    p { margin: 0 0 8px; color: var(--sgth-tinta-suave); }
    .vacio__fase { margin-bottom: 24px; }
  `,
})
export class EnConstruccion {
  private readonly datos = toSignal(inject(ActivatedRoute).data);
  protected readonly modulo = computed(() => this.datos()?.['modulo'] as OpcionMenu | undefined);
}
