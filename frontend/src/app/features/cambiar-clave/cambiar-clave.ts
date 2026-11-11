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
  protected readonly motivo = computed(() => this.sesion.usuario()?.motivoClave ?? null);
  protected readonly nombre = computed(() => this.sesion.usuario()?.nombre ?? '');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      claveActual: ['', Validators.required],
      claveNueva: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(72), Validators.pattern(/(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d)/)]],
      confirmar: ['', Validators.required],
    },
    { validators: coinciden },
  );

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Requisitos visibles mientras se escribe la clave nueva. */
  protected readonly requisitos = computed(() => {
    const v = this.valores();
    const nueva = v.claveNueva ?? '';
    const u = this.sesion.usuario();
    const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const partes = [u?.usuario ?? '', ...(u?.nombre ?? '').split(/\s+/)].map(sinTildes).filter((p) => p.length >= 4);
    return [
      { texto: 'Al menos 12 caracteres (puede ser una frase con espacios)', cumple: nueva.length >= 12 },
      { texto: 'Letras y números', cumple: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) && /\d/.test(nueva) },
      { texto: 'Sin su usuario ni su nombre', cumple: !!nueva && !partes.some((p) => sinTildes(nueva).includes(p)) },
      { texto: 'Sin secuencias como 1234 o abcd, ni el mismo carácter 4 veces', cumple: !!nueva && !/(.)\1{3,}/.test(nueva) && !/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/i.test(nueva) },
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
      await this.router.navigate([this.sesion.destino()]);
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
