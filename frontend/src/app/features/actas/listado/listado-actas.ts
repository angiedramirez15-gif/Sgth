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
import { Router, RouterLink } from '@angular/router';
import { SesionService } from '../../../core/sesion.service';
import { AvisosService } from '../../../shared/avisos.service';
import { sinTildes } from '../../colaboradores/colaboradores.service';
import { ActasService, ESTADOS_ACTA, type EstadoActa, type FilaActa, type Plantilla } from '../actas.service';

const NOMBRES: Record<Plantilla, string> = {
  DOTACION: 'Dotación', EPP: 'EPP', EQUIPOS: 'Equipos', MUEBLES: 'Muebles', OTROS: 'Otros', DEVOLUCION: 'Devolución',
};

@Component({
  selector: 'app-listado-actas',
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './listado-actas.html',
  styleUrl: './listado-actas.scss',
})
export class ListadoActas implements OnInit {
  private readonly api = inject(ActasService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);
  protected readonly puedeEntregar = this.sesion.puede('actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar');
  protected readonly puedeDevolver = this.sesion.puede('actas_activos.gestionar');
  protected readonly estados = ESTADOS_ACTA;
  protected readonly nombres = NOMBRES;

  protected readonly filas = signal<FilaActa[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal(false);
  protected readonly texto = signal('');
  protected readonly plantilla = signal<'' | Plantilla>('');
  protected readonly estado = signal<'' | EstadoActa>('');

  protected readonly pendientes = computed(() => this.filas().filter((f) => f.estado === 'PENDIENTE_ACTA').length);
  protected readonly plantillasUsadas = computed(() => [...new Set(this.filas().map((f) => f.plantilla))]);
  protected readonly filtradas = computed(() => {
    const t = sinTildes(this.texto().trim());
    return this.filas().filter((f) =>
      (!this.plantilla() || f.plantilla === this.plantilla()) &&
      (!this.estado() || f.estado === this.estado()) &&
      (!t || sinTildes(`${f.consecutivo} ${f.colaborador} ${f.documento} ${f.resumen}`).includes(t)),
    );
  });

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set(false);
    try {
      this.filas.set(await this.api.listar());
    } catch (e) {
      this.error.set(true);
      this.avisos.error(e, 'No se pudieron cargar las actas');
    } finally {
      this.cargando.set(false);
    }
  }

  abrir(f: FilaActa) {
    this.router.navigate(['/actas', f.id]);
  }

  limpiar() {
    this.texto.set('');
    this.plantilla.set('');
    this.estado.set('');
  }
}
