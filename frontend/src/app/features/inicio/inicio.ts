import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MENU_ADMINISTRACION, MENU_PRINCIPAL } from '../../core/menu';
import { SesionService } from '../../core/sesion.service';

interface Salud {
  backend: string;
  baseDatos: string;
}

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, MatIconModule],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
})
export class Inicio implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly http = inject(HttpClient);

  protected readonly nombre = computed(() => (this.sesion.usuario()?.nombre ?? '').split(' ')[0]);
  protected readonly saludo = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();
  protected readonly fecha = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  protected readonly modulos = computed(() =>
    [...MENU_PRINCIPAL, ...MENU_ADMINISTRACION].filter((o) => this.sesion.puede(...o.permisos)),
  );
  protected readonly salud = signal<Salud | null>(null);
  protected readonly sinConexion = signal(false);

  async ngOnInit() {
    try {
      this.salud.set(await firstValueFrom(this.http.get<Salud>('/api/salud')));
    } catch {
      this.sinConexion.set(true);
    }
  }
}
