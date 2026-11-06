import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { Avatar } from '../../../shared/avatar';
import { AvisosService } from '../../../shared/avisos.service';
import { ColaboradoresService, etiqueta, type FichaColaborador, type OpcionesColaborador } from '../colaboradores.service';
import { Expediente } from './expediente';
import { RetiroDialogo, type DatosRetiro } from './retiro-dialogo';

interface Dato { etiqueta: string; valor: string | number | null | undefined; ancho?: boolean }

@Component({
  selector: 'app-ficha',
  imports: [DatePipe, RouterLink, Avatar, Expediente, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, MatTabsModule],
  templateUrl: './ficha.html',
  styleUrl: './ficha.scss',
  providers: [DatePipe, DecimalPipe],
})
export class Ficha implements OnInit {
  private readonly api = inject(ColaboradoresService);
  private readonly dialogo = inject(MatDialog);
  private readonly avisos = inject(AvisosService);
  private readonly fecha = inject(DatePipe);
  private readonly decimal = inject(DecimalPipe);
  private readonly sesion = inject(SesionService);

  readonly id = input.required<string>();

  protected readonly ficha = signal<FichaColaborador | null>(null);
  protected readonly opciones = signal<OpcionesColaborador | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly versionFoto = signal(0);
  protected readonly subiendoFoto = signal(false);
  protected readonly totalDocumentos = signal<number | null>(null);

  protected readonly puedeGestionar = this.sesion.puede('colaboradores.gestionar');
  protected readonly puedeVerDocumentos = this.sesion.puede('documentos.ver', 'documentos.ver_sst');

  protected readonly nombre = computed(() => {
    const f = this.ficha();
    return f ? `${f.nombres} ${f.apellidos}` : '';
  });

  /** Antigüedad legible: "2 años y 3 meses". */
  protected readonly antiguedad = computed(() => {
    const f = this.ficha();
    if (!f) return '';
    const fin = f.fechaRetiro ? new Date(f.fechaRetiro) : new Date();
    const ini = new Date(f.fechaIngreso);
    let meses = (fin.getFullYear() - ini.getFullYear()) * 12 + fin.getMonth() - ini.getMonth();
    if (fin.getDate() < ini.getDate()) meses--;
    if (meses < 1) return 'Menos de un mes';
    const a = Math.floor(meses / 12), m = meses % 12;
    const partes = [a ? `${a} año${a > 1 ? 's' : ''}` : '', m ? `${m} mes${m > 1 ? 'es' : ''}` : ''].filter(Boolean);
    return partes.join(' y ');
  });

  /** Datos agrupados por sección, listos para mostrar. */
  protected readonly secciones = computed(() => {
    const f = this.ficha();
    const l = this.opciones()?.listas;
    if (!f || !l) return [];
    const d = (v: string | null) => (v ? this.fecha.transform(v, 'd MMMM y') : null);
    const tallas = (l.tipoTalla ?? []).map((t) => ({ etiqueta: t.etiqueta, valor: f.tallas?.[t.valor] }));
    const s: { titulo: string; datos: Dato[]; sensible?: boolean }[] = [
      {
        titulo: 'Datos personales',
        datos: [
          { etiqueta: 'Documento', valor: `${f.tipoDocumentoNombre} ${f.numeroDocumento}` },
          { etiqueta: 'Sexo', valor: etiqueta(l.sexo, f.sexo) },
          { etiqueta: 'Fecha de nacimiento', valor: f.fechaNacimiento ? `${d(f.fechaNacimiento)} (${this.edad(f.fechaNacimiento)} años)` : null },
          ...(f.permisos.verSalud ? [{ etiqueta: 'Tipo de sangre', valor: f.tipoSangre }] : []),
          { etiqueta: 'Estado civil', valor: etiqueta(l.estadoCivil, f.estadoCivil) || null },
          { etiqueta: 'Hijos', valor: f.numeroHijos },
          { etiqueta: 'Personas a cargo', valor: f.personasACargo },
          { etiqueta: 'Nivel educativo', valor: etiqueta(l.nivelEducativo, f.nivelEducativo) || null },
        ],
      },
      {
        titulo: 'Contacto',
        datos: [
          { etiqueta: 'Teléfono', valor: f.telefono },
          { etiqueta: 'Correo', valor: f.correo },
          { etiqueta: 'Dirección', valor: [f.direccion, f.ciudadResidencia].filter(Boolean).join(', ') || null, ancho: true },
          { etiqueta: 'Contacto de emergencia', valor: [f.contactoEmergenciaNombre, f.contactoEmergenciaTelefono].filter(Boolean).join(', ') || null, ancho: true },
        ],
      },
      {
        titulo: 'Datos laborales',
        datos: [
          { etiqueta: 'Cargo', valor: f.cargoNombre },
          { etiqueta: 'Área', valor: f.areaNombre },
          { etiqueta: 'Jefe inmediato', valor: f.jefeNombre },
          { etiqueta: 'Fecha de ingreso', valor: `${d(f.fechaIngreso)} (${this.antiguedad()})` },
          { etiqueta: 'Tipo de contrato', valor: etiqueta(l.tipoContrato, f.tipoContrato) },
          { etiqueta: 'Fin de contrato', valor: d(f.fechaFinContrato) },
          { etiqueta: 'Derecho a dotación', valor: etiqueta(l.derechoDotacion, f.derechoDotacion) },
        ],
      },
      {
        titulo: 'Seguridad social',
        datos: [
          { etiqueta: 'EPS', valor: f.epsNombre },
          { etiqueta: 'Fondo de pensiones', valor: f.afpNombre },
          { etiqueta: 'ARL', valor: f.arlNombre ? `${f.arlNombre}${f.nivelRiesgoArl ? `, riesgo ${f.nivelRiesgoArl}` : ''}` : f.nivelRiesgoArl ? `Riesgo ${f.nivelRiesgoArl}` : null },
          { etiqueta: 'Caja de compensación', valor: f.ccfNombre },
          { etiqueta: 'Fondo de cesantías', valor: f.cesantiasNombre },
        ],
      },
      { titulo: 'Tallas', datos: tallas },
    ];
    if (f.permisos.verSensibles) {
      s.push({
        titulo: 'Salario y datos bancarios',
        sensible: true,
        datos: [
          { etiqueta: 'Salario mensual', valor: f.salario != null ? `$ ${this.decimal.transform(f.salario, '1.0-0')}` : null },
          { etiqueta: 'Banco', valor: f.banco },
          { etiqueta: 'Cuenta', valor: f.numeroCuenta ? `${etiqueta(l.tipoCuenta, f.tipoCuenta ?? null)} ${f.numeroCuenta}`.trim() : null },
        ],
      });
    }
    return s;
  });

  async ngOnInit() {
    try {
      const [ficha, opciones] = await Promise.all([this.api.obtener(Number(this.id())), this.api.opciones()]);
      this.ficha.set(ficha);
      this.opciones.set(opciones);
    } catch (e) {
      this.noExiste.set(true);
      this.avisos.error(e, 'No se pudo cargar la ficha');
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarFoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!['image/jpeg', 'image/png'].includes(archivo.type)) return this.avisos.error(null, 'La foto debe ser JPG o PNG');
    if (archivo.size > 3 * 1024 * 1024) return this.avisos.error(null, 'La foto no puede pesar más de 3 MB');
    this.subiendoFoto.set(true);
    try {
      await this.api.subirFoto(this.ficha()!.id, archivo);
      this.ficha.update((f) => (f ? { ...f, tieneFoto: true } : f));
      this.versionFoto.update((v) => v + 1);
      this.avisos.exito('Foto actualizada');
    } catch (err) {
      this.avisos.error(err, 'No se pudo subir la foto');
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  async retirar() {
    const f = this.ficha()!;
    const ref = this.dialogo.open<RetiroDialogo, DatosRetiro, { ficha: FichaColaborador; elementosSinDevolver: number }>(RetiroDialogo, {
      data: { id: f.id, nombre: this.nombre(), fechaIngreso: f.fechaIngreso },
      width: '480px',
      maxWidth: '95vw',
    });
    const r = await firstValueFrom(ref.afterClosed());
    if (!r) return;
    this.ficha.set(r.ficha);
    this.avisos.exito(
      r.elementosSinDevolver
        ? `Retiro registrado. Tiene ${r.elementosSinDevolver} elemento(s) sin devolver; regístrelos como devolución en Equipos y muebles`
        : 'Retiro registrado',
    );
  }

  async reactivar() {
    const ok = await this.avisos.confirmar({
      titulo: 'Reactivar colaborador',
      mensaje: `Se deshará el retiro de ${this.nombre()} y volverá a estar activo. Use esta opción si el retiro se registró por error o si la persona reingresa con el mismo contrato.`,
      accion: 'Reactivar',
    });
    if (!ok) return;
    try {
      this.ficha.set(await this.api.reactivar(this.ficha()!.id));
      this.avisos.exito('Colaborador reactivado');
    } catch (e) {
      this.avisos.error(e);
    }
  }

  private edad(nacimiento: string) {
    const n = new Date(nacimiento), h = new Date();
    let e = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
    return e;
  }
}
