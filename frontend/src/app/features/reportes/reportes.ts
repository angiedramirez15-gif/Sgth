import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { SesionService } from '../../core/sesion.service';
import { AvisosService } from '../../shared/avisos.service';
import { mensajeDeErrorBlob } from '../administracion/plantillas/plantillas';

type Clave = 'colaboradores' | 'dotacion' | 'epp' | 'existencias' | 'documentos' | 'activos' | 'actas';
type Filtro = 'estadoColaborador' | 'rango' | 'cargo' | 'tipoActa' | 'estadoActa';

interface Reporte {
  clave: Clave;
  titulo: string;
  descripcion: string;
  icono: string;
  permisos: string[];
  filtros: Filtro[];
}

const REPORTES: Reporte[] = [
  { clave: 'colaboradores', titulo: 'Colaboradores', icono: 'badge', descripcion: 'Datos personales, laborales y de seguridad social. El salario sale solo si su rol puede verlo.', permisos: ['colaboradores.ver'], filtros: ['estadoColaborador'] },
  { clave: 'documentos', titulo: 'Documentos vencidos o faltantes', icono: 'folder_off', descripcion: 'Documentos vencidos o por vencer, y los obligatorios del cargo que no se han cargado.', permisos: ['documentos.ver', 'documentos.ver_sst'], filtros: [] },
  { clave: 'dotacion', titulo: 'Entregas de dotación', icono: 'apparel', descripcion: 'Una fila por prenda entregada, con el período, la talla y el acta.', permisos: ['inventario_dotacion.ver', 'inventario_dotacion.gestionar', 'actas_dotacion.gestionar'], filtros: ['rango', 'cargo'] },
  { clave: 'epp', titulo: 'Entregas de EPP', icono: 'health_and_safety', descripcion: 'Una fila por EPP entregado, con la fecha de reposición y si ya se repuso.', permisos: ['inventario_epp.ver', 'inventario_epp.gestionar', 'actas_epp.gestionar'], filtros: ['rango', 'cargo'] },
  { clave: 'existencias', titulo: 'Existencias de inventario', icono: 'inventory_2', descripcion: 'Stock por elemento y talla, y unidades de equipos y muebles por estado.', permisos: ['inventario_dotacion.ver', 'inventario_epp.ver', 'inventario_activos.ver', 'inventario_dotacion.gestionar', 'inventario_epp.gestionar', 'inventario_activos.gestionar'], filtros: [] },
  { clave: 'activos', titulo: 'Equipos y muebles', icono: 'devices', descripcion: 'Cada activo con su placa, serial, estado y a quién está asignado.', permisos: ['inventario_activos.ver', 'inventario_activos.gestionar'], filtros: [] },
  { clave: 'actas', titulo: 'Actas', icono: 'description', descripcion: 'Actas de entrega y devolución, con su estado y lo que incluye cada una.', permisos: ['actas.ver', 'actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar'], filtros: ['rango', 'tipoActa', 'estadoActa'] },
];

interface Valores { estado: string; desde: string; hasta: string; cargoId: number | null; plantilla: string; estadoActa: string }

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss',
})
export class Reportes implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);

  protected readonly reportes = REPORTES.filter((r) => this.sesion.puede(...r.permisos));
  protected readonly cargos = signal<{ id: number; nombre: string }[]>([]);
  protected readonly descargando = signal<Clave | null>(null);
  protected readonly valores: Record<string, Valores> = Object.fromEntries(
    REPORTES.map((r) => [r.clave, { estado: 'ACTIVO', desde: '', hasta: '', cargoId: null, plantilla: '', estadoActa: '' }]),
  );

  async ngOnInit() {
    if (this.reportes.some((r) => r.filtros.includes('cargo'))) {
      try {
        const lista = await firstValueFrom(this.http.get<{ id: number; nombre: string; activo: boolean }[]>('/api/catalogos/cargos'));
        this.cargos.set(lista.filter((c) => c.activo !== false));
      } catch {
        // sin lista de cargos, el filtro queda en "Todos"
      }
    }
  }

  /** Atajos de rango de fechas. */
  rango(r: Reporte, cual: 'mes' | 'anterior' | 'anio' | 'todo') {
    const hoy = new Date();
    const iso = (d: Date) => d.toLocaleDateString('en-CA');
    const v = this.valores[r.clave];
    if (cual === 'todo') { v.desde = ''; v.hasta = ''; return; }
    if (cual === 'mes') { v.desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); v.hasta = iso(hoy); }
    if (cual === 'anterior') { v.desde = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)); v.hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)); }
    if (cual === 'anio') { v.desde = `${hoy.getFullYear()}-01-01`; v.hasta = iso(hoy); }
  }

  async descargar(r: Reporte) {
    const v = this.valores[r.clave];
    const params: Record<string, string> = {};
    if (r.filtros.includes('estadoColaborador') && v.estado) params['estado'] = v.estado;
    if (r.filtros.includes('rango')) {
      if (v.desde) params['desde'] = v.desde;
      if (v.hasta) params['hasta'] = v.hasta;
    }
    if (r.filtros.includes('cargo') && v.cargoId) params['cargoId'] = String(v.cargoId);
    if (r.filtros.includes('tipoActa') && v.plantilla) params['plantilla'] = v.plantilla;
    if (r.filtros.includes('estadoActa') && v.estadoActa) params['estado'] = v.estadoActa;
    this.descargando.set(r.clave);
    try {
      const resp = await firstValueFrom(this.http.get(`/api/reportes/${r.clave}`, { params, responseType: 'blob', observe: 'response' }));
      const nombre = /filename\*=UTF-8''([^;]+)/.exec(resp.headers.get('Content-Disposition') ?? '')?.[1];
      const url = URL.createObjectURL(resp.body!);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre ? decodeURIComponent(nombre) : `${r.titulo}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.avisos.error(null, await mensajeDeErrorBlob(e));
    } finally {
      this.descargando.set(null);
    }
  }
}
