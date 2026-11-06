import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { mensajeDeError } from '../core/autenticacion';
import { Confirmar, type DatosConfirmar } from './confirmar';

/** Mensajes cortos y confirmaciones, con el mismo estilo en todo el sistema. */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly snack = inject(MatSnackBar);
  private readonly dialogo = inject(MatDialog);

  exito(mensaje: string) {
    this.snack.open(mensaje, 'Cerrar', { duration: 4000, panelClass: 'sgth-aviso-ok' });
  }

  error(error: unknown, porDefecto?: string) {
    this.snack.open(mensajeDeError(error, porDefecto), 'Cerrar', { duration: 7000, panelClass: 'sgth-aviso-error' });
  }

  async confirmar(datos: DatosConfirmar): Promise<boolean> {
    const ref = this.dialogo.open(Confirmar, { data: datos, width: '440px', autoFocus: 'dialog' });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
