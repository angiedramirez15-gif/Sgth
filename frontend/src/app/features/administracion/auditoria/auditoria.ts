import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { AvisosService } from '../../../shared/avisos.service';

interface Fila {
  id: number; fecha: string; usuario: string | null; accion: string; accionNombre: string; modulo: string;
  registroId: number | null; antes: unknown; despues: unknown; ip: string | null;
}
interface Opcion { valor: string; nombre: string }

/** Registro de auditoría: quién hizo qué y cuándo (solo consulta). */
@Component({
  selector: 'app-auditoria',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.scss',
})
export class Auditoria implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);

  protected readonly filas = signal<Fila[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly porPagina = signal(100);
  protected readonly cargando = signal(false);
  protected readonly abierta = signal<number | null>(null);
  protected readonly usuarios = signal<{ id: number; nombre: string }[]>([]);
  protected readonly modulos = signal<Opcion[]>([]);
  protected readonly acciones = signal<Opcion[]>([]);
  protected filtro = { desde: '', hasta: '', usuarioId: '' as string | number, accion: '', modulo: '' };

  async ngOnInit() {
    try {
      const o = await firstValueFrom(this.http.get<{ usuarios: { id: number; nombre: string }[]; modulos: Opcion[]; acciones: Opcion[] }>('/api/auditoria/opciones'));
      this.usuarios.set(o.usuarios);
      this.modulos.set(o.modulos);
      this.acciones.set(o.acciones);
    } catch (e) {
      this.avisos.error(e);
    }
    await this.buscar(1);
  }

  async buscar(pagina = 1) {
    const params: Record<string, string> = { pagina: String(pagina) };
    for (const [k, v] of Object.entries(this.filtro)) if (v !== '' && v !== null) params[k] = String(v);
    this.cargando.set(true);
    try {
      const r = await firstValueFrom(this.http.get<{ total: number; pagina: number; porPagina: number; filas: Fila[] }>('/api/auditoria', { params }));
      this.filas.set(r.filas);
      this.total.set(r.total);
      this.pagina.set(r.pagina);
      this.porPagina.set(r.porPagina);
      this.abierta.set(null);
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.cargando.set(false);
    }
  }

  limpiar() {
    this.filtro = { desde: '', hasta: '', usuarioId: '', accion: '', modulo: '' };
    this.buscar(1);
  }

  paginas() {
    return Math.max(1, Math.ceil(this.total() / this.porPagina()));
  }

  /** Resumen en una línea de lo que cambió o se registró. */
  resumen(f: Fila): string {
    const a = f.antes && typeof f.antes === 'object' ? (f.antes as Record<string, unknown>) : null;
    const d = f.despues && typeof f.despues === 'object' ? (f.despues as Record<string, unknown>) : null;
    if (a && d) {
      const cambios = Object.keys(d).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]));
      return cambios.slice(0, 3).map((k) => `${k}: ${this.valor(a[k])} → ${this.valor(d[k])}`).join(' · ') + (cambios.length > 3 ? ' …' : '');
    }
    const datos = d ?? a;
    if (!datos) return '';
    return Object.entries(datos).slice(0, 3).map(([k, v]) => `${k}: ${this.valor(v)}`).join(' · ') + (Object.keys(datos).length > 3 ? ' …' : '');
  }

  json(v: unknown) {
    return JSON.stringify(v, null, 2);
  }

  private valor(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }
}
