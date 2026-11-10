import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SesionService } from '../../../core/sesion.service';
import { Stock } from '../stock/stock';

/** Dotación: inventario de uniformes y calzado. Las entregas por período llegan en la Fase 4b. */
@Component({
  selector: 'app-dotacion',
  imports: [Stock, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="sgth-pagina">
      <header class="sgth-encabezado">
        <div>
          <h1>Dotación</h1>
          <p>Uniformes y calzado en bodega, por talla. Las entradas suman al stock y las entregas con acta lo descuentan.</p>
        </div>
        @if (puedeEntregar) {
          <a mat-flat-button routerLink="/actas/entrega" [queryParams]="{ tipo: 'DOTACION' }"><mat-icon>assignment_ind</mat-icon>Entregar dotación</a>
        }
      </header>
      <app-stock categoria="DOTACION" />
    </div>
  `,
})
export class Dotacion {
  protected readonly puedeEntregar = inject(SesionService).puede('actas_dotacion.gestionar');
}
