import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { mensajeDeError } from '../../../core/autenticacion';
import { AdministracionService, type CodigoRol, type Rol, type Usuario, type UsuarioConClave } from '../administracion.service';

export interface DatosUsuarioDialogo {
  usuario?: Usuario; // si viene, es edición
  roles: Rol[];
  esUnoMismo: boolean;
}

/** Sugerencia de usuario: inicial del nombre + primer apellido, sin tildes. "María López" → "mlopez" */
function sugerirUsuario(nombre: string): string {
  const partes = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  if (partes.length < 2 || !partes[0]) return partes[0] ?? '';
  const apellido = partes.length >= 4 ? partes[2] : partes[1];
  return (partes[0][0] + apellido).slice(0, 40);
}

@Component({
  selector: 'app-usuario-dialogo',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  templateUrl: './usuario-dialogo.html',
  styles: `
    form { display: grid; gap: 14px; padding-top: 8px; }
    mat-form-field { width: 100%; }
    .error { margin: 0 0 12px; padding: 10px 12px; border-left: 4px solid var(--sgth-error); border-radius: 6px; background: #fdecea; color: var(--sgth-error); font-size: 0.9rem; }
    .rol-descripcion { display: block; font-size: 0.8rem; color: var(--sgth-tinta-suave); white-space: normal; line-height: 1.3; padding-bottom: 6px; }
    .nota { margin: 0; font-size: 0.85rem; color: var(--sgth-tinta-suave); }
  `,
})
export class UsuarioDialogo {
  private readonly api = inject(AdministracionService);
  private readonly ref = inject(MatDialogRef<UsuarioDialogo, Usuario | UsuarioConClave>);
  protected readonly datos = inject<DatosUsuarioDialogo>(MAT_DIALOG_DATA);
  protected readonly edicion = !!this.datos.usuario;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  private usuarioTocado = false;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nombreCompleto: [this.datos.usuario?.nombreCompleto ?? '', [Validators.required, Validators.maxLength(150)]],
    usuario: [this.datos.usuario?.usuario ?? '', [Validators.required, Validators.pattern(/^[a-z0-9._-]{3,40}$/)]],
    cargo: [this.datos.usuario?.cargo ?? '', [Validators.required, Validators.maxLength(100)]],
    correo: [this.datos.usuario?.correo ?? '', [Validators.email, Validators.maxLength(150)]],
    rol: [(this.datos.usuario?.rol ?? 'TH') as CodigoRol, Validators.required],
  });

  constructor() {
    if (this.edicion) this.form.controls.usuario.disable();
    // Mientras no lo escriban a mano, el usuario se sugiere a partir del nombre
    this.form.controls.nombreCompleto.valueChanges.subscribe((nombre) => {
      if (!this.edicion && !this.usuarioTocado) this.form.controls.usuario.setValue(sugerirUsuario(nombre));
    });
  }

  nombreRol(codigo: string) {
    return this.datos.roles.find((r) => r.codigo === codigo)?.nombre ?? '';
  }

  marcarUsuarioTocado() {
    this.usuarioTocado = true;
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const datos = { nombreCompleto: v.nombreCompleto, cargo: v.cargo, correo: v.correo || null, rol: v.rol };
    try {
      const resultado = this.edicion
        ? await this.api.editarUsuario(this.datos.usuario!.id, datos)
        : await this.api.crearUsuario({ ...datos, usuario: v.usuario });
      this.ref.close(resultado);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar el usuario'));
    } finally {
      this.guardando.set(false);
    }
  }
}
