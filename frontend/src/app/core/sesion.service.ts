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
  motivoClave: 'TEMPORAL' | 'VENCIDA' | null;
  aceptarCompromiso: boolean;
  dobleVerificacion: boolean;
}

export interface SesionLista {
  paso: 'LISTO';
  minutosInactividad: number;
  usuario: UsuarioSesion;
  codigosRespaldo?: string[];
}
export type RespuestaIngreso = SesionLista | { paso: 'CODIGO' | 'CONFIGURAR' };

export interface ConfiguracionVerificacion { qr: string; secreto: string; cuenta: string }

export type MotivoSalida = 'manual' | 'inactividad' | 'expirada';

/**
 * Estado de la sesión: quién inició sesión, sus permisos y el cierre por inactividad (RF-02).
 * El token NO se guarda en el navegador: viaja en una cookie que JavaScript no puede leer.
 * Al abrir o recargar la página se pregunta al servidor si hay sesión (iniciar()).
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zona = inject(NgZone);

  private readonly sesion = signal<SesionLista | null>(null);
  private temporizador?: ReturnType<typeof setTimeout>;
  private ultimoMovimiento = 0;
  private ultimoAviso = 0;

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly debeCambiarClave = computed(() => this.sesion()?.usuario.cambiarClave ?? false);
  readonly debeAceptarCompromiso = computed(() => this.sesion()?.usuario.aceptarCompromiso ?? false);
  /** Motivo del último cierre, para mostrarlo en la pantalla de ingreso. */
  readonly motivoSalida = signal<MotivoSalida | null>(null);

  constructor() {
    for (const evento of ['pointerdown', 'keydown', 'pointermove', 'wheel']) {
      this.zona.runOutsideAngular(() =>
        window.addEventListener(evento, () => this.registrarActividad(), { passive: true }),
      );
    }
  }

  /** Al cargar la aplicación: recupera la sesión si la cookie sigue vigente. */
  async iniciar(): Promise<void> {
    try {
      this.guardar(await firstValueFrom(this.http.get<SesionLista>('/api/auth/perfil')));
    } catch {
      this.sesion.set(null);
    }
  }

  async ingresar(usuario: string, clave: string): Promise<RespuestaIngreso> {
    const r = await firstValueFrom(this.http.post<RespuestaIngreso>('/api/auth/login', { usuario, clave }));
    if (r.paso === 'LISTO') this.guardar(r);
    this.motivoSalida.set(null);
    return r;
  }

  configurarVerificacion() {
    return firstValueFrom(this.http.post<ConfiguracionVerificacion>('/api/auth/verificacion/configurar', {}));
  }

  async activarVerificacion(codigo: string): Promise<SesionLista> {
    const r = await firstValueFrom(this.http.post<SesionLista>('/api/auth/verificacion/activar', { codigo }));
    this.guardar(r);
    return r;
  }

  async verificarCodigo(codigo: string): Promise<SesionLista> {
    const r = await firstValueFrom(this.http.post<SesionLista>('/api/auth/verificacion/codigo', { codigo }));
    this.guardar(r);
    return r;
  }

  async cambiarClave(claveActual: string, claveNueva: string): Promise<void> {
    this.guardar(await firstValueFrom(this.http.post<SesionLista>('/api/auth/cambiar-clave', { claveActual, claveNueva })));
  }

  compromiso() {
    return firstValueFrom(this.http.get<{ id: number; version: number; texto: string; aceptadoEn: string | null } | null>('/api/auth/compromiso'));
  }

  async aceptarCompromiso(textoId: number): Promise<void> {
    this.guardar(await firstValueFrom(this.http.post<SesionLista>('/api/auth/compromiso', { textoId })));
  }

  nuevosCodigosRespaldo(clave: string) {
    return firstValueFrom(this.http.post<{ codigosRespaldo: string[] }>('/api/auth/verificacion/respaldos', { clave }));
  }

  /** Pantalla a la que debe ir el usuario después de ingresar o de completar un paso. */
  destino(): string {
    if (this.debeCambiarClave()) return '/cambiar-clave';
    if (this.debeAceptarCompromiso()) return '/compromiso';
    return '/';
  }

  salir(motivo: MotivoSalida = 'manual') {
    clearTimeout(this.temporizador);
    const habia = this.sesion() !== null;
    this.sesion.set(null);
    this.motivoSalida.set(motivo === 'manual' ? null : motivo);
    // Borra la cookie en el servidor (si ya expiró, no pasa nada)
    if (habia) this.http.post('/api/auth/salir', {}).subscribe({ error: () => undefined });
    this.zona.run(() => this.router.navigate(['/ingresar']));
  }

  /** true si el usuario tiene al menos uno de los permisos. Sin permisos = siempre visible. */
  puede(...permisos: string[]): boolean {
    if (!permisos.length) return true;
    const propios = this.usuario()?.permisos ?? [];
    return permisos.some((p) => propios.includes(p));
  }

  private guardar(r: SesionLista) {
    this.sesion.set({ paso: 'LISTO', minutosInactividad: r.minutosInactividad, usuario: r.usuario });
    this.ultimoAviso = Date.now();
    this.vigilarInactividad();
  }

  private registrarActividad() {
    // Como máximo una vez cada 15 segundos, para no reprogramar el temporizador en cada movimiento
    if (!this.sesion() || Date.now() - this.ultimoMovimiento < 15_000) return;
    this.ultimoMovimiento = Date.now();
    this.vigilarInactividad();
    // El servidor también cierra la sesión por inactividad: si el usuario está trabajando
    // (escribiendo un formulario largo, por ejemplo) se le avisa que sigue activo.
    const s = this.sesion()!;
    if (Date.now() - this.ultimoAviso > (s.minutosInactividad * 60_000) / 3) {
      this.ultimoAviso = Date.now();
      this.http.get('/api/auth/perfil').subscribe({ error: () => undefined });
    }
  }

  private vigilarInactividad() {
    clearTimeout(this.temporizador);
    const s = this.sesion();
    if (!s) return;
    this.zona.runOutsideAngular(() => {
      this.temporizador = setTimeout(() => this.salir('inactividad'), s.minutosInactividad * 60_000);
    });
  }
}
