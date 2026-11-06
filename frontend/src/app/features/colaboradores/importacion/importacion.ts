import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/autenticacion';
import { AvisosService } from '../../../shared/avisos.service';
import { ColaboradoresService, guardarArchivo, type ResultadoImportacion } from '../colaboradores.service';

@Component({
  selector: 'app-importacion',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './importacion.html',
  styleUrl: './importacion.scss',
})
export class Importacion {
  private readonly api = inject(ColaboradoresService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  protected readonly archivo = signal<File | null>(null);
  protected readonly resultado = signal<ResultadoImportacion | null>(null);
  protected readonly trabajando = signal<'plantilla' | 'revisando' | 'importando' | null>(null);
  protected readonly error = signal<string | null>(null);

  async descargarPlantilla() {
    this.trabajando.set('plantilla');
    try {
      guardarArchivo(await this.api.plantilla(), 'Plantilla_colaboradores_SGTH.xlsx');
    } catch (e) {
      this.avisos.error(e, 'No se pudo descargar la plantilla');
    } finally {
      this.trabajando.set(null);
    }
  }

  async elegir(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      this.error.set('El archivo debe ser de Excel (.xlsx). Si lo guardó en otro formato, ábralo en Excel y guárdelo como "Libro de Excel".');
      return;
    }
    this.archivo.set(f);
    await this.revisar();
  }

  async revisar() {
    const f = this.archivo();
    if (!f) return;
    this.trabajando.set('revisando');
    this.error.set(null);
    this.resultado.set(null);
    try {
      this.resultado.set(await this.api.importar(f, false));
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo revisar el archivo'));
    } finally {
      this.trabajando.set(null);
    }
  }

  async importar() {
    const f = this.archivo();
    const r = this.resultado();
    if (!f || !r || r.errores.length) return;
    const ok = await this.avisos.confirmar({
      titulo: 'Importar colaboradores',
      mensaje: `Se registrarán ${r.validas} colaboradores en el SGTH.`,
      accion: `Importar ${r.validas}`,
    });
    if (!ok) return;
    this.trabajando.set('importando');
    try {
      const final = await this.api.importar(f, true);
      if (final.errores.length) {
        this.resultado.set(final);
        this.error.set('Alguien cambió los datos mientras tanto. Revise los errores y vuelva a intentarlo.');
        return;
      }
      this.avisos.exito(`${final.creados} colaboradores importados`);
      await this.router.navigate(['/colaboradores']);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo importar'));
    } finally {
      this.trabajando.set(null);
    }
  }

  reiniciar() {
    this.archivo.set(null);
    this.resultado.set(null);
    this.error.set(null);
  }
}
