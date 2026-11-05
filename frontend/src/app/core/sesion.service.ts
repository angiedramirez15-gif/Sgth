import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface UsuarioSesion {
  id: number;
  usuario: string;
  nombre: string;
  cargo: string;
  rol: string;
  permisos: string[];
  cambiarClave: boolean;
}

interface RespuestaSesion {
  token: string;
  minutosInactividad: number;
  usuario: UsuarioSesion;
}

interface SesionGuardada extends RespuestaSesion {
  expira: number; // milisegundos (exp del JWT)
}

export type MotivoSalida = 'manual' | 'inactividad' | 'expirada';

const CLAVE_ALMACEN = 'sgth.sesion';

/** Lee el campo exp del token JWT (sin validarlo: eso lo hace el backend). */
function expiracionToken(token: string): number {
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(carga.exp) * 1000;
  } catch {
    return 0;
  }
}

/**
 * Estado de la sesión: quién inició sesión, sus permisos y el cierre por inactividad (RF-02).
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zona = inject(NgZone);

  private readonly sesion = signal<SesionGuardada | null>(this.leer());
  private temporizador?: ReturnType<typeof setTimeout>;
  private ultimoMovimiento = 0;

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly token = computed(() => this.sesion()?.token ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly debeCambiarClave = computed(() => this.sesion()?.usuario.cambiarClave ?? false);
  /** Motivo del último cierre, para mostrarlo en la pantalla de ingreso. */
  readonly motivoSalida = signal<MotivoSalida | null>(null);

  constructor() {
    if (this.sesion()) this.vigilarInactividad();
    for (const evento of ['pointerdown', 'keydown', 'pointermove', 'wheel']) {
      this.zona.runOutsideAngular(() =>
        window.addEventListener(evento, () => this.registrarActividad(), { passive: true }),
      );
    }
  }

  async ingresar(usuario: string, clave: string): Promise<UsuarioSesion> {
    const r = await firstValueFrom(this.http.post<RespuestaSesion>('/api/auth/login', { usuario, clave }));
    this.guardar(r);
    this.motivoSalida.set(null);
    return r.usuario;
  }

  async cambiarClave(claveActual: string, claveNueva: string): Promise<void> {
    const r = await firstValueFrom(
      this.http.post<RespuestaSesion>('/api/auth/cambiar-clave', { claveActual, claveNueva }),
    );
    this.guardar(r);
  }

  salir(motivo: MotivoSalida = 'manual') {
    clearTimeout(this.temporizador);
    this.sesion.set(null);
    this.motivoSalida.set(motivo === 'manual' ? null : motivo);
    try { localStorage.removeItem(CLAVE_ALMACEN); } catch { /* almacenamiento no disponible */ }
    this.zona.run(() => this.router.navigate(['/ingresar']));
  }

  /** true si el usuario tiene al menos uno de los permisos. Sin permisos = siempre visible. */
  puede(...permisos: string[]): boolean {
    if (!permisos.length) return true;
    const propios = this.usuario()?.permisos ?? [];
    return permisos.some((p) => propios.includes(p));
  }

  private guardar(r: RespuestaSesion) {
    const s: SesionGuardada = { ...r, expira: expiracionToken(r.token) };
    this.sesion.set(s);
    try { localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(s)); } catch { /* sin almacenamiento: la sesión dura mientras la pestaña esté abierta */ }
    this.vigilarInactividad();
  }

  private leer(): SesionGuardada | null {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE_ALMACEN) ?? 'null') as SesionGuardada | null;
      return s && s.expira > Date.now() ? s : null;
    } catch {
      return null;
    }
  }

  private registrarActividad() {
    // Como máximo una vez cada 15 segundos, para no reprogramar el temporizador en cada movimiento
    if (!this.sesion() || Date.now() - this.ultimoMovimiento < 15_000) return;
    this.ultimoMovimiento = Date.now();
    this.vigilarInactividad();
  }

  private vigilarInactividad() {
    clearTimeout(this.temporizador);
    const s = this.sesion();
    if (!s) return;
    const porInactividad = s.minutosInactividad * 60_000;
    const porExpiracion = s.expira - Date.now();
    const espera = Math.max(0, Math.min(porInactividad, porExpiracion));
    this.zona.runOutsideAngular(() => {
      this.temporizador = setTimeout(
        () => this.salir(porExpiracion <= porInactividad ? 'expirada' : 'inactividad'),
        espera,
      );
    });
  }
}
