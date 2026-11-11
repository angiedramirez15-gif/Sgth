import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { type ConfiguracionVerificacion, SesionService } from '../../core/sesion.service';

/** clave → (codigo | configurar → respaldo) → sistema */
type Paso = 'clave' | 'codigo' | 'configurar' | 'respaldo';

@Component({
  selector: 'app-ingreso',
  imports: [ReactiveFormsModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  templateUrl: './ingreso.html',
  styleUrl: './ingreso.scss',
})
export class Ingreso {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    usuario: ['', Validators.required],
    clave: ['', Validators.required],
  });
  protected readonly paso = signal<Paso>('clave');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly verClave = signal(false);
  protected readonly motivo = this.sesion.motivoSalida;
  protected readonly anio = new Date().getFullYear();

  // Doble verificación
  protected codigo = '';
  protected readonly usarRespaldo = signal(false);
  protected readonly configuracion = signal<ConfiguracionVerificacion | null>(null);
  protected readonly respaldos = signal<string[]>([]);
  protected guardados = false;

  async ingresar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.ejecutar(async () => {
      const { usuario, clave } = this.form.getRawValue();
      const r = await this.sesion.ingresar(usuario, clave);
      this.form.controls.clave.reset();
      if (r.paso === 'LISTO') return this.continuar();
      this.codigo = '';
      if (r.paso === 'CODIGO') {
        this.paso.set('codigo');
      } else {
        this.paso.set('configurar');
        this.configuracion.set(await this.sesion.configurarVerificacion());
      }
    }, () => this.form.controls.clave.reset());
  }

  async verificar() {
    if (!this.codigo.trim()) return this.error.set('Escriba el código');
    await this.ejecutar(async () => {
      await this.sesion.verificarCodigo(this.codigo);
      await this.continuar();
    }, () => (this.codigo = ''));
  }

  async activar() {
    if (!/^\d{6}$/.test(this.codigo.replace(/\s/g, ''))) return this.error.set('Escriba los 6 números que muestra la app');
    await this.ejecutar(async () => {
      const r = await this.sesion.activarVerificacion(this.codigo);
      this.respaldos.set(r.codigosRespaldo ?? []);
      this.paso.set('respaldo');
    }, () => (this.codigo = ''));
  }

  copiarRespaldos() {
    navigator.clipboard?.writeText(this.respaldos().join('\n')).catch(() => undefined);
  }

  async continuar() {
    await this.router.navigate([this.sesion.destino()]);
  }

  volver() {
    this.paso.set('clave');
    this.error.set(null);
    this.codigo = '';
    this.usarRespaldo.set(false);
  }

  private async ejecutar(accion: () => Promise<unknown>, alFallar?: () => void) {
    this.enviando.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (e) {
      const mensaje = mensajeDeError(e, 'No se pudo iniciar sesión');
      this.error.set(mensaje);
      alFallar?.();
      // Si pasaron los 10 minutos o se bloqueó el usuario, se vuelve a pedir la clave
      if (/usuario y clave|bloqueado/i.test(mensaje) && this.paso() !== 'clave') {
        this.paso.set('clave');
        this.error.set(mensaje);
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
