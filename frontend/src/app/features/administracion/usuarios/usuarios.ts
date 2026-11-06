import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { AdministracionService, type Rol, type Usuario, type UsuarioConClave } from '../administracion.service';
import { ClaveTemporal, type DatosClaveTemporal } from './clave-temporal';
import { UsuarioDialogo, type DatosUsuarioDialogo } from './usuario-dialogo';

const NOMBRE_MODULO: Record<string, string> = {
  usuarios: 'Usuarios', configuracion: 'Configuración', auditoria: 'Auditoría', catalogos: 'Catálogos',
  colaboradores: 'Colaboradores', documentos: 'Documentos', inventario: 'Inventario', actas: 'Actas',
  alertas: 'Alertas', reportes: 'Reportes',
};

function sinTildes(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

@Component({
  selector: 'app-usuarios',
  imports: [
    DatePipe, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatMenuModule, MatProgressBarModule, MatTabsModule,
  ],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  private readonly api = inject(AdministracionService);
  private readonly dialogo = inject(MatDialog);
  private readonly avisos = inject(AvisosService);
  protected readonly yo = inject(SesionService).usuario;

  protected readonly usuarios = signal<Usuario[]>([]);
  protected readonly roles = signal<Rol[]>([]);
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal(false);

  protected readonly texto = signal('');
  protected readonly rol = signal<string>('');
  protected readonly verInactivos = signal(false);

  protected readonly filtrados = computed(() => {
    const t = sinTildes(this.texto().trim());
    return this.usuarios().filter(
      (u) =>
        (this.verInactivos() || u.activo) &&
        (!this.rol() || u.rol === this.rol()) &&
        (!t || sinTildes(`${u.nombreCompleto} ${u.usuario} ${u.cargo}`).includes(t)),
    );
  });
  protected readonly totalInactivos = computed(() => this.usuarios().filter((u) => !u.activo).length);

  /** Permisos de cada rol agrupados por módulo, para la pestaña "Roles y permisos". */
  protected readonly rolesAgrupados = computed(() =>
    this.roles().map((r) => {
      const grupos = new Map<string, string[]>();
      for (const p of r.permisos) {
        const nombre = NOMBRE_MODULO[p.modulo] ?? p.modulo;
        grupos.set(nombre, [...(grupos.get(nombre) ?? []), p.descripcion]);
      }
      return { ...r, grupos: [...grupos.entries()].map(([modulo, acciones]) => ({ modulo, acciones })) };
    }),
  );

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.errorCarga.set(false);
    try {
      const [usuarios, roles] = await Promise.all([this.api.usuarios(), this.api.roles()]);
      this.usuarios.set(usuarios);
      this.roles.set(roles);
    } catch (e) {
      this.errorCarga.set(true);
      this.avisos.error(e, 'No se pudo cargar la lista de usuarios');
    } finally {
      this.cargando.set(false);
    }
  }

  async nuevo() {
    const r = await this.abrirDialogo({ roles: this.roles(), esUnoMismo: false });
    if (r && 'claveTemporal' in r) {
      this.reemplazar(r.usuario);
      this.mostrarClave('Usuario creado', r);
    }
  }

  async editar(u: Usuario) {
    const r = await this.abrirDialogo({ usuario: u, roles: this.roles(), esUnoMismo: u.id === this.yo()?.id });
    if (r && !('claveTemporal' in r)) {
      this.reemplazar(r);
      this.avisos.exito('Usuario actualizado');
    }
  }

  async restablecer(u: Usuario) {
    const ok = await this.avisos.confirmar({
      titulo: 'Restablecer clave',
      mensaje: `Se generará una clave temporal nueva para ${u.nombreCompleto}. Su clave actual dejará de funcionar y, si estaba bloqueado, quedará desbloqueado.`,
      accion: 'Restablecer clave',
    });
    if (!ok) return;
    try {
      const r = await this.api.restablecerClave(u.id);
      this.reemplazar(r.usuario);
      this.mostrarClave('Clave restablecida', r);
    } catch (e) {
      this.avisos.error(e);
    }
  }

  async cambiarEstado(u: Usuario) {
    if (u.activo) {
      const ok = await this.avisos.confirmar({
        titulo: 'Inactivar usuario',
        mensaje: `${u.nombreCompleto} ya no podrá ingresar al sistema. Su historial se conserva y puede activarlo de nuevo cuando quiera.`,
        accion: 'Inactivar',
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      this.reemplazar(await this.api.estadoUsuario(u.id, !u.activo));
      this.avisos.exito(u.activo ? 'Usuario inactivado' : 'Usuario activado');
    } catch (e) {
      this.avisos.error(e);
    }
  }

  private async abrirDialogo(data: DatosUsuarioDialogo) {
    const ref = this.dialogo.open<UsuarioDialogo, DatosUsuarioDialogo, Usuario | UsuarioConClave>(UsuarioDialogo, {
      data,
      width: '520px',
      maxWidth: '95vw',
    });
    return firstValueFrom(ref.afterClosed());
  }

  private mostrarClave(titulo: string, r: UsuarioConClave) {
    this.dialogo.open<ClaveTemporal, DatosClaveTemporal>(ClaveTemporal, {
      data: { titulo, nombre: r.usuario.nombreCompleto, usuario: r.usuario.usuario, clave: r.claveTemporal },
      width: '480px',
      maxWidth: '95vw',
      disableClose: true, // que no se cierre por un clic fuera sin haber anotado la clave
    });
  }

  private reemplazar(u: Usuario) {
    const lista = this.usuarios();
    const i = lista.findIndex((x) => x.id === u.id);
    this.usuarios.set(i >= 0 ? lista.map((x) => (x.id === u.id ? u : x)) : [...lista, u]);
  }
}
