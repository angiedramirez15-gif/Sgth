import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AvisosService } from '../../../shared/avisos.service';
import { AdministracionService, type CampoCatalogo, type DefinicionCatalogo, type RegistroCatalogo } from '../administracion.service';
import { RegistroDialogo, type DatosRegistroDialogo } from './registro-dialogo';

function sinTildes(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

@Component({
  selector: 'app-catalogos',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatMenuModule, MatProgressBarModule],
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.scss',
})
export class Catalogos implements OnInit {
  private readonly api = inject(AdministracionService);
  private readonly dialogo = inject(MatDialog);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  /** Catálogo seleccionado, desde la dirección: /administracion/catalogos?c=cargos */
  readonly c = input<string>();

  protected readonly definiciones = signal<DefinicionCatalogo[]>([]);
  protected readonly registros = signal<RegistroCatalogo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly texto = signal('');
  protected readonly verInactivos = signal(false);

  protected readonly actual = computed(() => {
    const defs = this.definiciones();
    return defs.find((d) => d.clave === this.c()) ?? defs[0];
  });
  protected readonly columnas = computed(() => (this.actual()?.campos ?? []).filter((c) => c.enTabla !== false));
  protected readonly filtrados = computed(() => {
    const t = sinTildes(this.texto().trim());
    const cols = this.columnas();
    return this.registros().filter(
      (r) => (this.verInactivos() || r.activo) && (!t || sinTildes(cols.map((c) => this.valor(r, c)).join(' ')).includes(t)),
    );
  });
  protected readonly totalInactivos = computed(() => this.registros().filter((r) => !r.activo).length);

  private cargado = '';

  async ngOnInit() {
    try {
      this.definiciones.set(await this.api.catalogos());
    } catch (e) {
      this.avisos.error(e, 'No se pudieron cargar los catálogos');
    }
    await this.cargarRegistros();
  }

  /** Se llama al cambiar de catálogo en el menú. */
  async seleccionar(clave: string) {
    if (clave === this.actual()?.clave) return;
    this.texto.set('');
    this.verInactivos.set(false);
    await this.router.navigate([], { queryParams: { c: clave }, replaceUrl: true });
    await this.cargarRegistros();
  }

  async cargarRegistros() {
    const d = this.actual();
    if (!d) {
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    this.cargado = d.clave;
    try {
      const filas = await this.api.registros(d.clave);
      if (this.cargado === d.clave) this.registros.set(filas);
    } catch (e) {
      this.avisos.error(e, 'No se pudieron cargar los registros');
      this.registros.set([]);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Texto que se muestra en la tabla para un campo. */
  valor(r: RegistroCatalogo, c: CampoCatalogo): string {
    const v = r[c.columna];
    if (c.tipo === 'booleano') return v ? 'Sí' : 'No';
    if (v === null || v === undefined || v === '') return '';
    if (c.tipo === 'referencia') return String(r[`${c.columna}__nombre`] ?? '');
    if (c.tipo === 'opciones') return c.opciones?.find((o) => o.valor === String(v))?.etiqueta ?? String(v);
    return String(v);
  }

  async agregar() {
    await this.abrir();
  }

  async editar(r: RegistroCatalogo) {
    await this.abrir(r);
  }

  async cambiarEstado(r: RegistroCatalogo) {
    const d = this.actual()!;
    const nombre = String(r[d.columnaNombre]);
    if (r.activo) {
      const ok = await this.avisos.confirmar({
        titulo: 'Inactivar',
        mensaje: `"${nombre}" dejará de aparecer en las listas para nuevos registros. Los registros que ya lo usan no cambian, y puede activarlo de nuevo cuando quiera.`,
        accion: 'Inactivar',
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      this.reemplazar(await this.api.estadoRegistro(d.clave, r.id, !r.activo));
      this.avisos.exito(r.activo ? `"${nombre}" inactivado` : `"${nombre}" activado`);
    } catch (e) {
      this.avisos.error(e);
    }
  }

  private async abrir(registro?: RegistroCatalogo) {
    const d = this.actual()!;
    // Cargar las opciones de los campos que apuntan a otro catálogo (ej. áreas para los cargos)
    const referencias: DatosRegistroDialogo['referencias'] = {};
    try {
      for (const c of d.campos.filter((x) => x.tipo === 'referencia')) {
        const ref = this.definiciones().find((x) => x.clave === c.referencia)!;
        referencias[c.referencia!] = (await this.api.registros(c.referencia!)).map((x) => ({
          id: x.id,
          nombre: String(x[ref.columnaNombre]),
          activo: x.activo,
        }));
      }
    } catch (e) {
      this.avisos.error(e);
      return;
    }
    const ref = this.dialogo.open<RegistroDialogo, DatosRegistroDialogo, RegistroCatalogo>(RegistroDialogo, {
      data: { definicion: d, registro, referencias },
      width: '480px',
      maxWidth: '95vw',
    });
    const r = await firstValueFrom(ref.afterClosed());
    if (r) {
      this.reemplazar(r);
      this.avisos.exito(registro ? 'Cambios guardados' : 'Registro agregado');
    }
  }

  private reemplazar(r: RegistroCatalogo) {
    const lista = this.registros();
    this.registros.set(lista.some((x) => x.id === r.id) ? lista.map((x) => (x.id === r.id ? r : x)) : [r, ...lista]);
  }
}
