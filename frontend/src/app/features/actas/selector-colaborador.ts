import { Component, computed, effect, input, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { type FilaColaborador, sinTildes } from '../colaboradores/colaboradores.service';

/** Buscador de colaborador por nombre, documento o cargo. */
@Component({
  selector: 'app-selector-colaborador',
  imports: [FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule],
  template: `
    <mat-form-field class="campo" [subscriptSizing]="'dynamic'">
      <mat-label>{{ etiqueta() }}</mat-label>
      <mat-icon matPrefix>person_search</mat-icon>
      <input matInput [ngModel]="texto()" (ngModelChange)="escribir($event)" [matAutocomplete]="auto" [disabled]="deshabilitado()"
        placeholder="Nombre, documento o cargo" autocomplete="off">
      @if (seleccionado() && !deshabilitado()) {
        <button matSuffix mat-icon-button type="button" (click)="limpiar()" aria-label="Quitar colaborador"><mat-icon>close</mat-icon></button>
      }
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="elegir($event.option.value)" [displayWith]="nombre">
        @for (c of sugerencias(); track c.id) {
          <mat-option [value]="c">
            <span class="opcion">{{ c.nombres }} {{ c.apellidos }}</span>
            <span class="opcion__sub">{{ c.tipoDocumento }} {{ c.numeroDocumento }}, {{ c.cargo }}</span>
          </mat-option>
        } @empty {
          @if (texto().length > 1) { <mat-option disabled>Nadie coincide con "{{ texto() }}"</mat-option> }
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    :host { display: block; }
    .campo { width: 100%; }
    .opcion { display: block; line-height: 1.3; }
    .opcion__sub { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); line-height: 1.3; }
  `,
})
export class SelectorColaborador {
  readonly colaboradores = input.required<FilaColaborador[]>();
  readonly etiqueta = input('Colaborador');
  readonly excluir = input<number | null>(null);
  readonly deshabilitado = input(false);
  readonly valor = model<number | null>(null);

  protected readonly texto = signal('');
  private anterior: number | null = null;
  protected readonly seleccionado = computed(() => this.colaboradores().find((c) => c.id === this.valor()) ?? null);
  protected readonly sugerencias = computed(() => {
    const t = sinTildes(this.texto().trim());
    const lista = this.colaboradores().filter((c) => c.id !== this.excluir());
    if (!t) return lista.slice(0, 30);
    return lista.filter((c) => sinTildes(`${c.nombres} ${c.apellidos} ${c.numeroDocumento} ${c.cargo}`).includes(t)).slice(0, 30);
  });

  constructor() {
    // Si el valor llega desde afuera (por ejemplo, la URL), se muestra el nombre
    effect(() => {
      const c = this.seleccionado();
      if (c) this.texto.set(`${c.nombres} ${c.apellidos}`);
      // Si desde afuera se limpia el valor (por ejemplo, después de agregar a alguien), se limpia el texto
      else if (this.anterior !== null) untracked(() => this.texto.set(''));
      this.anterior = c?.id ?? null;
    });
  }

  protected nombre = (c: FilaColaborador | string | null) => (typeof c === 'string' ? c : c ? `${c.nombres} ${c.apellidos}` : '');

  escribir(v: string | FilaColaborador) {
    if (typeof v !== 'string') return;
    this.texto.set(v);
    if (this.valor() !== null) {
      this.anterior = null; // la persona está escribiendo: no borrar lo que escribe
      this.valor.set(null);
    }
  }

  elegir(c: FilaColaborador) {
    this.valor.set(c.id);
    this.texto.set(`${c.nombres} ${c.apellidos}`);
  }

  limpiar() {
    this.valor.set(null);
    this.texto.set('');
  }
}
