import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../core/autenticacion';
import { SesionService } from '../../core/sesion.service';

function coinciden(grupo: AbstractControl): ValidationErrors | null {
  const nueva = grupo.get('claveNueva')?.value;
  const confirmar = grupo.get('confirmar')?.value;
  return confirmar && nueva !== confirmar ? { noCoinciden: true } : null;
}

@Component({
  selector: 'app-cambiar-clave',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  templateUrl: './cambiar-clave.html',
  styleUrl: './cambiar-clave.scss',
})
export class CambiarClave {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly avisos = inject(MatSnackBar);

  protected readonly obligatorio = this.sesion.debeCambiarClave;
  protected readonly nombre = computed(() => this.sesion.usuario()?.nombre ?? '');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      claveActual: ['', Validators.required],
      claveNueva: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d)/)]],
      confirmar: ['', Validators.required],
    },
    { validators: coinciden },
  );

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Requisitos visibles mientras se escribe la clave nueva. */
  protected readonly requisitos = computed(() => {
    const v = this.valores();
    const nueva = v.claveNueva ?? '';
    return [
      { texto: 'Al menos 8 caracteres', cumple: nueva.length >= 8 },
      { texto: 'Al menos una letra y un número', cumple: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) && /\d/.test(nueva) },
      { texto: 'Diferente a la clave actual', cumple: !!nueva && nueva !== v.claveActual },
      { texto: 'Las dos claves nuevas coinciden', cumple: !!nueva && nueva === v.confirmar },
    ];
  });

  async guardar() {
    if (this.form.invalid || this.requisitos().some((r) => !r.cumple)) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      const { claveActual, claveNueva } = this.form.getRawValue();
      await this.sesion.cambiarClave(claveActual, claveNueva);
      this.avisos.open('Clave cambiada', 'Cerrar', { duration: 4000, panelClass: 'sgth-aviso-ok' });
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cambiar la clave'));
    } finally {
      this.enviando.set(false);
    }
  }

  cancelar() {
    if (this.obligatorio()) this.sesion.salir();
    else this.location.back();
  }
}
