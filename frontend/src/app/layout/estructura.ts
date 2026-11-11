import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MENU_ADMINISTRACION, MENU_PRINCIPAL } from '../core/menu';
import { SesionService } from '../core/sesion.service';
import { AlertasService } from '../features/alertas/alertas.service';

const NOMBRE_ROL: Record<string, string> = {
  ADMIN: 'Administrador',
  TH: 'Talento Humano',
  SST: 'Seguridad y Salud en el Trabajo',
  CONSULTA: 'Consulta',
};

/** Estructura de las pantallas internas: menú lateral, barra superior y contenido. */
@Component({
  selector: 'app-estructura',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, MatTooltipModule],
  templateUrl: './estructura.html',
  styleUrl: './estructura.scss',
})
export class Estructura {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly alertas = inject(AlertasService);

  /** Alertas activas que se muestran junto a la opción "Alertas" del menú. */
  protected readonly totalAlertas = computed(() => this.alertas.resumen()?.total ?? 0);

  constructor() {
    // Se actualiza al entrar y al cambiar de pantalla (como máximo una vez por minuto)
    this.alertas.refrescar();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.alertas.refrescar());
  }

  protected readonly usuario = this.sesion.usuario;
  protected readonly rol = computed(() => NOMBRE_ROL[this.usuario()?.rol ?? ''] ?? '');
  protected readonly iniciales = computed(() =>
    (this.usuario()?.nombre ?? '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
  );
  protected readonly principal = computed(() => MENU_PRINCIPAL.filter((o) => this.sesion.puede(...o.permisos)));
  protected readonly administracion = computed(() => MENU_ADMINISTRACION.filter((o) => this.sesion.puede(...o.permisos)));

  protected readonly movil = toSignal(
    inject(BreakpointObserver).observe('(max-width: 960px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly menuAbierto = signal(false); // en celular el menú empieza cerrado

  /** Título de la pantalla actual, tomado de data.titulo de la ruta. */
  protected readonly titulo = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.tituloActual()),
    ),
    { initialValue: this.tituloActual() },
  );

  private tituloActual(): string {
    let r = this.router.routerState.snapshot.root;
    while (r.firstChild) r = r.firstChild;
    return (r.data?.['titulo'] as string) ?? '';
  }

  alNavegar() {
    if (this.movil()) this.menuAbierto.set(false);
  }

  salir() {
    this.sesion.salir();
  }
}
