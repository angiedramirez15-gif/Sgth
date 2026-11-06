import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { mensajeDeError } from '../../../core/autenticacion';
import { ColaboradoresService } from '../../colaboradores/colaboradores.service';
import { AdministracionService } from '../administracion.service';

export interface DatosObligatorios { cargoId: number; cargo: string }

/** Qué documentos debe tener todo colaborador de un cargo (RF-24). */
@Component({
  selector: 'app-obligatorios-dialogo',
  imports: [MatDialogModule, MatCheckboxModule, MatButtonModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Documentos obligatorios</h2>
    <mat-dialog-content>
      <p class="ayuda">Marque los documentos que debe tener todo colaborador con el cargo <strong>{{ d.cargo }}</strong>. Los que falten aparecerán como pendientes en su ficha.</p>
      @if (cargando()) { <mat-progress-bar mode="indeterminate" aria-label="Cargando" /> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <ul class="lista">
        @for (t of tipos(); track t.id) {
          <li><mat-checkbox [checked]="marcados().has(t.id)" (change)="alternar(t.id)">{{ t.nombre }}</mat-checkbox></li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button (click)="guardar()" [disabled]="guardando() || cargando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .ayuda { margin: 0 0 12px; color: var(--sgth-tinta-suave); }
    strong { color: var(--sgth-tinta); }
    .lista { margin: 0; padding: 0; list-style: none; columns: 2 220px; }
    li { break-inside: avoid; }
    .error { margin: 0 0 12px; padding: 10px 12px; border-left: 4px solid var(--sgth-error); border-radius: 6px; background: #fdecea; color: var(--sgth-error); }
  `,
})
export class ObligatoriosDialogo implements OnInit {
  private readonly colaboradores = inject(ColaboradoresService);
  private readonly admin = inject(AdministracionService);
  private readonly ref = inject(MatDialogRef<ObligatoriosDialogo, boolean>);
  protected readonly d = inject<DatosObligatorios>(MAT_DIALOG_DATA);
  protected readonly tipos = signal<{ id: number; nombre: string }[]>([]);
  protected readonly marcados = signal(new Set<number>());
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      const [tipos, obligatorios] = await Promise.all([this.admin.registros('tipos_documento_expediente'), this.colaboradores.obligatorios(this.d.cargoId)]);
      this.tipos.set(tipos.filter((t) => t.activo || obligatorios.includes(t.id)).map((t) => ({ id: t.id, nombre: String(t['nombre']) })));
      this.marcados.set(new Set(obligatorios));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  alternar(id: number) {
    const s = new Set(this.marcados());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.marcados.set(s);
  }

  async guardar() {
    this.guardando.set(true);
    try {
      await this.colaboradores.guardarObligatorios(this.d.cargoId, [...this.marcados()]);
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
