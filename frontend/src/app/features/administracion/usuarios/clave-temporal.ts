import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface DatosClaveTemporal {
  titulo: string;
  nombre: string;
  usuario: string;
  clave: string;
}

/** Muestra la clave temporal una sola vez, para entregarla a la persona. */
@Component({
  selector: 'app-clave-temporal',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ d.titulo }}</h2>
    <mat-dialog-content>
      <p>Entréguele estos datos a <strong>{{ d.nombre }}</strong>. En su primer ingreso el sistema le pedirá crear su propia clave.</p>

      <dl class="datos">
        <dt>Usuario</dt>
        <dd>{{ d.usuario }}</dd>
        <dt>Clave temporal</dt>
        <dd class="clave">{{ d.clave }}</dd>
      </dl>

      <button mat-stroked-button type="button" (click)="copiar()">
        <mat-icon>{{ copiado() ? 'check' : 'content_copy' }}</mat-icon>
        {{ copiado() ? 'Copiado' : 'Copiar usuario y clave' }}
      </button>

      <p class="advertencia">
        <mat-icon>visibility_off</mat-icon>
        Esta clave no se vuelve a mostrar. Si se pierde, use "Restablecer clave" para generar otra.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>Listo</button>
    </mat-dialog-actions>
  `,
  styles: `
    p { margin: 0 0 16px; color: var(--sgth-tinta-suave); }
    strong { color: var(--sgth-tinta); }
    .datos {
      display: grid; grid-template-columns: auto 1fr; gap: 6px 20px; margin: 0 0 16px; padding: 16px 18px;
      border-radius: 8px; background: var(--sgth-petroleo-suave);
      dt { color: var(--sgth-tinta-suave); }
      dd { margin: 0; font-weight: 600; color: var(--sgth-petroleo-profundo); }
    }
    .clave { font-size: 1.25rem; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; }
    .advertencia {
      display: flex; gap: 8px; align-items: flex-start; margin: 18px 0 0; font-size: 0.875rem; color: var(--sgth-ambar);
      mat-icon { flex: none; font-size: 20px; width: 20px; height: 20px; }
    }
  `,
})
export class ClaveTemporal {
  protected readonly d = inject<DatosClaveTemporal>(MAT_DIALOG_DATA);
  protected readonly copiado = signal(false);

  async copiar() {
    try {
      await navigator.clipboard.writeText(`Usuario: ${this.d.usuario}\nClave temporal: ${this.d.clave}`);
      this.copiado.set(true);
    } catch {
      // El portapapeles no está disponible (por ejemplo, si se accede por http desde otro PC): se copia a mano
    }
  }
}
