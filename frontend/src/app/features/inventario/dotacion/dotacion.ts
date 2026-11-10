import { Component } from '@angular/core';
import { Stock } from '../stock/stock';

/** Dotación: inventario de uniformes y calzado. Las entregas por período llegan en la Fase 4b. */
@Component({
  selector: 'app-dotacion',
  imports: [Stock],
  template: `
    <div class="sgth-pagina">
      <header class="sgth-encabezado">
        <div>
          <h1>Dotación</h1>
          <p>Uniformes y calzado en bodega, por talla. Las entradas suman al stock y las entregas con acta lo descuentan.</p>
        </div>
      </header>
      <app-stock categoria="DOTACION" />
    </div>
  `,
})
export class Dotacion {}
