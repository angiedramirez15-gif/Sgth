import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AvisosService } from '../../../shared/avisos.service';
import { AdministracionService, type Parametro } from '../administracion.service';
import { CertificadosService } from '../../certificados/certificados.service';

const ORDEN_GRUPOS = ['Dotación', 'Alertas', 'Empresa y actas', 'Certificados laborales', 'Seguridad', 'Archivos'];

@Component({
  selector: 'app-configuracion',
  imports: [FormsModule, DatePipe, DecimalPipe, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
})
export class Configuracion implements OnInit, OnDestroy {
  private readonly api = inject(AdministracionService);
  private readonly avisos = inject(AvisosService);

  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly cargando = signal(true);
  /** Valores que se están editando, por clave. */
  protected readonly borradores = signal<Record<string, string>>({});
  protected readonly guardando = signal<string | null>(null);

  private readonly certificados = inject(CertificadosService);
  /** Imagen de la firma de los certificados (URL local del navegador). */
  protected readonly firma = signal<string | null>(null);
  protected readonly subiendoFirma = signal(false);

  protected readonly grupos = computed(() => {
    const ps = this.parametros();
    return ORDEN_GRUPOS.map((g) => ({ nombre: g, parametros: ps.filter((p) => p.grupo === g) })).filter((g) => g.parametros.length);
  });
  protected readonly faltaSalario = computed(() => {
    const p = this.parametros().find((x) => x.clave === 'smmlv_valor');
    return !!p && !p.valor;
  });

  async ngOnInit() {
    try {
      const ps = await this.api.parametros();
      this.parametros.set(ps);
      this.borradores.set(Object.fromEntries(ps.map((p) => [p.clave, p.valor ?? ''])));
      if (ps.some((p) => p.grupo === 'Certificados laborales')) await this.cargarFirma();
    } catch (e) {
      this.avisos.error(e, 'No se pudo cargar la configuración');
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
    const url = this.firma();
    if (url) URL.revokeObjectURL(url);
  }

  private async cargarFirma() {
    try {
      const blob = await this.certificados.firma();
      const anterior = this.firma();
      if (anterior) URL.revokeObjectURL(anterior);
      this.firma.set(URL.createObjectURL(blob));
    } catch {
      this.firma.set(null); // todavía no se ha subido
    }
  }

  async subirFirma(evento: Event) {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.subiendoFirma.set(true);
    try {
      await this.certificados.subirFirma(archivo);
      await this.cargarFirma();
      this.avisos.exito('Firma guardada');
    } catch (e) {
      this.avisos.error(e, 'No se pudo guardar la firma');
    } finally {
      this.subiendoFirma.set(false);
    }
  }

  editar(clave: string, valor: string) {
    this.borradores.update((b) => ({ ...b, [clave]: valor }));
  }

  cambiado(p: Parametro): boolean {
    return (this.borradores()[p.clave] ?? '').trim() !== (p.valor ?? '');
  }

  descartar(p: Parametro) {
    this.editar(p.clave, p.valor ?? '');
  }

  async guardar(p: Parametro) {
    this.guardando.set(p.clave);
    try {
      const nuevo = await this.api.guardarParametro(p.clave, this.borradores()[p.clave] ?? '');
      this.parametros.update((ps) => ps.map((x) => (x.clave === p.clave ? nuevo : x)));
      this.editar(p.clave, nuevo.valor ?? '');
      this.avisos.exito(`"${p.etiqueta}" guardado`);
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.guardando.set(null);
    }
  }
}
