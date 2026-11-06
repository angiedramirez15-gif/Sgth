import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DatosConfirmar {
  titulo: string;
  mensaje: string;
  accion: string; // texto del botón: "Inactivar", "Restablecer clave"…
  peligro?: boolean;
}

@Component({
  selector: 'app-confirmar',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content><p>{{ datos.mensaje }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button [class.peligro]="datos.peligro" [mat-dialog-close]="true">{{ datos.accion }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    p { margin: 0; color: var(--sgth-tinta-suave); }
    .peligro { --mat-button-filled-container-color: var(--sgth-error); }
  `,
})
export class Confirmar {
  protected readonly datos = inject<DatosConfirmar>(MAT_DIALOG_DATA);
}
