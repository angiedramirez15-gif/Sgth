import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { mensajeDeError } from '../core/autenticacion';
import { SesionService } from '../core/sesion.service';

/** Genera códigos de respaldo nuevos (los anteriores dejan de servir). Pide la clave para confirmar. */
@Component({
  selector: 'app-respaldos-dialogo',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Códigos de respaldo</h2>
    <mat-dialog-content>
      @if (!codigos().length) {
        <p>Sirven para ingresar si no tiene el celular. Al generar códigos nuevos, los anteriores dejan de funcionar.</p>
        <form id="form-respaldos" (ngSubmit)="generar()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Su clave, para confirmar</mat-label>
            <input matInput type="password" name="clave" [(ngModel)]="clave" autocomplete="current-password" required>
          </mat-form-field>
        </form>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      } @else {
        <p>Guárdelos en un lugar seguro, fuera de este computador. Cada uno sirve una sola vez.</p>
        <ul class="codigos">
          @for (c of codigos(); track c) { <li><code>{{ c }}</code></li> }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (!codigos().length) {
        <button mat-button mat-dialog-close type="button">Cancelar</button>
        <button mat-flat-button type="submit" form="form-respaldos" [disabled]="!clave || enviando()">{{ enviando() ? 'Generando…' : 'Generar códigos nuevos' }}</button>
      } @else {
        <button mat-button type="button" (click)="copiar()"><mat-icon>content_copy</mat-icon>Copiar</button>
        <button mat-flat-button mat-dialog-close type="button">Ya los guardé</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { min-width: min(420px, 80vw); }
    mat-form-field { width: 100%; }
    .codigos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; padding: 14px; border: 1px dashed var(--sgth-petroleo); border-radius: 6px; list-style: none; }
    .error { color: var(--sgth-error); margin: 8px 0 0; }
  `,
})
export class RespaldosDialogo {
  private readonly sesion = inject(SesionService);
  protected clave = '';
  protected readonly codigos = signal<string[]>([]);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  async generar() {
    this.enviando.set(true);
    this.error.set('');
    try {
      this.codigos.set((await this.sesion.nuevosCodigosRespaldo(this.clave)).codigosRespaldo);
      this.clave = '';
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron generar los códigos'));
    } finally {
      this.enviando.set(false);
    }
  }

  copiar() {
    navigator.clipboard?.writeText(this.codigos().join('\n')).catch(() => undefined);
  }
}
