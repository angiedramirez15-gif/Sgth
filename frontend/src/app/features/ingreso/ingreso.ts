import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { SesionService } from '../../core/sesion.service';

@Component({
  selector: 'app-ingreso',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule],
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
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly verClave = signal(false);
  protected readonly motivo = this.sesion.motivoSalida;
  protected readonly anio = new Date().getFullYear();

  async ingresar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      const { usuario, clave } = this.form.getRawValue();
      const u = await this.sesion.ingresar(usuario, clave);
      await this.router.navigate([u.cambiarClave ? '/cambiar-clave' : '/']);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo iniciar sesión'));
      this.form.controls.clave.reset();
    } finally {
      this.enviando.set(false);
    }
  }
}
