import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { SesionService } from '../../../core/sesion.service';
import { Avatar } from '../../../shared/avatar';
import { AvisosService } from '../../../shared/avisos.service';
import { ColaboradoresService, etiqueta, type FilaColaborador, type OpcionesColaborador, sinTildes } from '../colaboradores.service';

@Component({
  selector: 'app-colaboradores',
  imports: [DatePipe, FormsModule, RouterLink, Avatar, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './listado.html',
  styleUrl: './listado.scss',
})
export class Listado implements OnInit {
  private readonly api = inject(ColaboradoresService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  protected readonly puedeGestionar = inject(SesionService).puede('colaboradores.gestionar');

  protected readonly filas = signal<FilaColaborador[]>([]);
  protected readonly opciones = signal<OpcionesColaborador | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal(false);

  protected readonly texto = signal('');
  protected readonly area = signal('');
  protected readonly cargo = signal('');
  protected readonly estado = signal<'ACTIVO' | 'RETIRADO' | 'TODOS'>('ACTIVO');

  protected readonly filtradas = computed(() => {
    const t = sinTildes(this.texto().trim());
    return this.filas().filter((f) =>
      (this.estado() === 'TODOS' || f.estado === this.estado()) &&
      (!this.area() || f.area === this.area()) &&
      (!this.cargo() || f.cargo === this.cargo()) &&
      (!t || sinTildes(`${f.nombres} ${f.apellidos} ${f.numeroDocumento} ${f.cargo}`).includes(t)),
    );
  });
  protected readonly conteo = computed(() => ({
    activos: this.filas().filter((f) => f.estado === 'ACTIVO').length,
    retirados: this.filas().filter((f) => f.estado === 'RETIRADO').length,
  }));
  /** Áreas y cargos que realmente tienen colaboradores, para los filtros. */
  protected readonly areas = computed(() => [...new Set(this.filas().map((f) => f.area))].sort());
  protected readonly cargos = computed(() => [...new Set(this.filas().filter((f) => !this.area() || f.area === this.area()).map((f) => f.cargo))].sort());

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set(false);
    try {
      const [filas, opciones] = await Promise.all([this.api.listar(), this.api.opciones()]);
      this.filas.set(filas);
      this.opciones.set(opciones);
    } catch (e) {
      this.error.set(true);
      this.avisos.error(e, 'No se pudo cargar la lista de colaboradores');
    } finally {
      this.cargando.set(false);
    }
  }

  contrato(valor: string) {
    return etiqueta(this.opciones()?.listas.tipoContrato, valor);
  }

  abrir(f: FilaColaborador) {
    this.router.navigate(['/colaboradores', f.id]);
  }

  limpiarFiltros() {
    this.texto.set('');
    this.area.set('');
    this.cargo.set('');
    this.estado.set('ACTIVO');
  }
}
