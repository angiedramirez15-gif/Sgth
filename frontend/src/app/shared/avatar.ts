import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { ColaboradoresService } from '../features/colaboradores/colaboradores.service';

/** Foto del colaborador, o sus iniciales si no tiene foto. */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="'Foto de ' + nombre()" [style.width.px]="tamano()" [style.height.px]="tamano()">
    } @else {
      <span class="iniciales" aria-hidden="true" [style.width.px]="tamano()" [style.height.px]="tamano()"
            [style.font-size.px]="tamano() * 0.38">{{ iniciales() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    img, .iniciales { border-radius: 50%; }
    img { object-fit: cover; background: var(--sgth-petroleo-suave); }
    .iniciales {
      display: grid; place-items: center; font-weight: 700;
      background: var(--sgth-petroleo-suave); color: var(--sgth-petroleo);
    }
  `,
})
export class Avatar implements OnDestroy {
  private readonly api = inject(ColaboradoresService);
  readonly colaboradorId = input.required<number>();
  readonly tieneFoto = input(false);
  readonly nombre = input('');
  readonly tamano = input(36);
  /** Cambia este número para volver a cargar la foto (después de subir una nueva). */
  readonly version = input(0);

  protected readonly url = signal<string | null>(null);
  protected readonly iniciales = computed(() =>
    this.nombre().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
  );

  constructor() {
    effect(() => {
      const id = this.colaboradorId();
      this.version();
      if (!this.tieneFoto()) return this.liberar();
      this.api.fotoUrl(id).then((u) => {
        this.liberar();
        this.url.set(u);
      });
    });
  }

  private liberar() {
    const u = this.url();
    if (u) URL.revokeObjectURL(u);
    this.url.set(null);
  }

  ngOnDestroy() {
    this.liberar();
  }
}
