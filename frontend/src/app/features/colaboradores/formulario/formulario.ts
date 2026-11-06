import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/autenticacion';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { ColaboradoresService, type DatosColaborador, type FichaColaborador, type OpcionesColaborador } from '../colaboradores.service';

const CONTRATOS_CON_FIN = ['FIJO', 'APRENDIZAJE'];

/** Fin de contrato obligatorio en término fijo y aprendizaje, y nunca antes del ingreso. */
function fechasContrato(g: AbstractControl): ValidationErrors | null {
  const tipo = g.get('tipoContrato')?.value;
  const ingreso = g.get('fechaIngreso')?.value;
  const fin = g.get('fechaFinContrato')?.value;
  if (CONTRATOS_CON_FIN.includes(tipo) && !fin) return { finRequerido: true };
  if (fin && ingreso && fin < ingreso) return { finAntesDeIngreso: true };
  return null;
}

@Component({
  selector: 'app-formulario-colaborador',
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './formulario.html',
  styleUrl: './formulario.scss',
})
export class Formulario implements OnInit {
  private readonly api = inject(ColaboradoresService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);

  /** Viene de la ruta /colaboradores/:id/editar; vacío al crear. */
  readonly id = input<string>();
  protected readonly edicion = computed(() => !!this.id());

  protected readonly opciones = signal<OpcionesColaborador | null>(null);
  protected readonly ficha = signal<FichaColaborador | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly verSensibles = computed(() => this.ficha()?.permisos.verSensibles ?? this.sesion.puede('colaboradores.ver_sensibles'));
  protected readonly verSalud = computed(() => this.ficha()?.permisos.verSalud ?? (this.verSensibles() || this.sesion.puede('documentos.ver_sst')));

  private readonly fb = inject(FormBuilder);
  protected readonly form = this.fb.group(
    {
      tipoDocumentoId: this.fb.control<number | null>(null, Validators.required),
      numeroDocumento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9.\s-]{3,24}$/)]],
      nombres: ['', [Validators.required, Validators.maxLength(100)]],
      apellidos: ['', [Validators.required, Validators.maxLength(100)]],
      sexo: ['', Validators.required],
      fechaNacimiento: [''],
      tipoSangre: [''],
      estadoCivil: [''],
      numeroHijos: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(30)]),
      personasACargo: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(30)]),
      nivelEducativo: [''],
      telefono: ['', Validators.maxLength(30)],
      correo: ['', [Validators.email, Validators.maxLength(150)]],
      direccion: ['', Validators.maxLength(200)],
      ciudadResidencia: ['', Validators.maxLength(80)],
      contactoEmergenciaNombre: ['', Validators.maxLength(150)],
      contactoEmergenciaTelefono: ['', Validators.maxLength(30)],
      cargoId: this.fb.control<number | null>(null, Validators.required),
      areaId: this.fb.control<number | null>(null, Validators.required),
      jefeId: this.fb.control<number | null>(null),
      fechaIngreso: ['', Validators.required],
      tipoContrato: ['', Validators.required],
      fechaFinContrato: [''],
      salario: this.fb.control<number | null>(null, Validators.min(0)),
      derechoDotacion: ['AUTO'],
      epsId: this.fb.control<number | null>(null),
      afpId: this.fb.control<number | null>(null),
      arlId: this.fb.control<number | null>(null),
      ccfId: this.fb.control<number | null>(null),
      cesantiasId: this.fb.control<number | null>(null),
      nivelRiesgoArl: this.fb.control<number | null>(null),
      banco: ['', Validators.maxLength(80)],
      tipoCuenta: [''],
      numeroCuenta: ['', Validators.pattern(/^[\d\s-]{4,34}$/)],
      tallas: this.fb.group({ CAMISA: [''], PANTALON: [''], CALZADO: [''], GUANTES: [''], OVEROL: [''] }),
    },
    { validators: fechasContrato },
  );

  private readonly tipoContrato = toSignal(this.form.controls.tipoContrato.valueChanges, { initialValue: '' });
  protected readonly requiereFin = computed(() => CONTRATOS_CON_FIN.includes(this.tipoContrato() ?? ''));

  protected entidades(tipo: string) {
    return this.opciones()?.entidades.filter((e) => e.tipo === tipo) ?? [];
  }
  protected jefes = computed(() => this.opciones()?.jefes.filter((j) => j.id !== Number(this.id())) ?? []);

  async ngOnInit() {
    try {
      const [opciones, ficha] = await Promise.all([this.api.opciones(), this.edicion() ? this.api.obtener(Number(this.id())) : null]);
      this.opciones.set(opciones);
      if (ficha) {
        this.ficha.set(ficha);
        this.form.patchValue({ ...ficha, tallas: { CAMISA: '', PANTALON: '', CALZADO: '', GUANTES: '', OVEROL: '', ...ficha.tallas } } as never);
      } else if (opciones.tiposDocumento.length) {
        this.form.controls.tipoDocumentoId.setValue(opciones.tiposDocumento[0].id);
      }
    } catch (e) {
      this.avisos.error(e, 'No se pudo cargar el formulario');
    } finally {
      this.cargando.set(false);
    }

    // Al elegir el cargo, se proponen su área y su riesgo ARL si aún no se han elegido
    this.form.controls.cargoId.valueChanges.subscribe((id) => {
      const cargo = this.opciones()?.cargos.find((c) => c.id === id);
      if (!cargo) return;
      if (cargo.areaId && !this.form.controls.areaId.value) this.form.controls.areaId.setValue(cargo.areaId);
      if (cargo.nivelRiesgoArl && !this.form.controls.nivelRiesgoArl.value) this.form.controls.nivelRiesgoArl.setValue(cargo.nivelRiesgoArl);
    });
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revise los campos marcados en rojo.');
      // Llevar la vista al primer campo con error
      setTimeout(() => document.querySelector<HTMLElement>('.mat-form-field-invalid input, .mat-form-field-invalid mat-select')?.focus());
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const datos = { ...v, tallas: v.tallas } as unknown as DatosColaborador;
    if (!this.verSensibles()) {
      delete datos.salario;
      delete datos.banco;
      delete datos.tipoCuenta;
      delete datos.numeroCuenta;
    }
    if (!this.verSalud()) delete datos.tipoSangre;
    try {
      const ficha = this.edicion() ? await this.api.editar(Number(this.id()), datos) : await this.api.crear(datos);
      this.avisos.exito(this.edicion() ? 'Cambios guardados' : 'Colaborador registrado');
      await this.router.navigate(['/colaboradores', ficha.id]);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      this.guardando.set(false);
    }
  }

  cancelar() {
    this.router.navigate(this.edicion() ? ['/colaboradores', this.id()] : ['/colaboradores']);
  }
}
