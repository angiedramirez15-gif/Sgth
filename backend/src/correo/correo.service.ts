import { hostname } from 'node:os';
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import { avisosServidorDetalle } from '../seguridad/estado-servidor.js';
import { enviarCorreo, guardarRegistro, leerRegistro, marcarAviso, modoCorreo, pieAviso, remitente, tocaAvisar } from './enviador.js';

/** Ingresos fallidos desde un mismo equipo (IP) en 15 minutos que se consideran sospechosos. */
export const UMBRAL_FALLOS_IP = 10;

/**
 * Avisos por correo al responsable del sistema: respaldo con error, certificado HTTPS por vencer e ingresos
 * sospechosos. (Si el sistema se cae, avisa el vigilante: scripts/vigilante.mjs, una tarea programada aparte.)
 * Un mismo aviso no se repite antes de su intervalo, y si el correo falla el sistema sigue funcionando.
 */
@Injectable()
export class CorreoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Correo');
  private temporizadores: NodeJS.Timeout[] = [];
  /** Avisos que se están enviando en este momento (evita duplicados si llegan dos intentos a la vez). */
  private readonly enCurso = new Set<string>();

  constructor(
    private readonly config: ConfiguracionService,
    private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'production') return;
    // Primera revisión a los 5 minutos de encender y luego cada hora
    const inicial = setTimeout(() => void this.revisarServidor(), 5 * 60_000);
    const cadaHora = setInterval(() => void this.revisarServidor(), 60 * 60_000);
    inicial.unref();
    cadaHora.unref();
    this.temporizadores = [inicial, cadaHora];
  }

  onModuleDestroy() {
    this.temporizadores.forEach((t) => clearTimeout(t));
  }

  async estado() {
    return { configurado: !!modoCorreo(), modo: modoCorreo(), remitente: remitente() || null, destino: (await this.destino()) || null };
  }

  private async destino(): Promise<string> {
    return (await this.config.texto('avisos_correo_destino', '')).trim();
  }

  /** Envía un aviso si toca (no enviado en las últimas `horas`). Nunca lanza errores. */
  async avisar(clave: string, asunto: string, cuerpo: string, horas = 24): Promise<boolean> {
    if (this.enCurso.has(clave)) return false;
    this.enCurso.add(clave);
    try {
      if (!modoCorreo()) return false;
      const para = await this.destino();
      if (!para || !tocaAvisar(clave, horas)) return false;
      const url = await this.config.texto('url_sistema', '');
      await enviarCorreo({ para, asunto: `SGTH: ${asunto}`, texto: cuerpo + '\n' + pieAviso(url) });
      marcarAviso(clave);
      this.guardarDestino(para);
      this.log.log(`Aviso enviado a ${para}: ${asunto}`);
      return true;
    } catch (e) {
      this.log.warn(`No se pudo enviar el aviso "${asunto}": ${(e as Error).message}`);
      return false;
    } finally {
      this.enCurso.delete(clave);
    }
  }

  /** El vigilante usa el último destino conocido si la base de datos no responde. */
  private guardarDestino(destino: string) {
    const r = leerRegistro();
    if (r.destino !== destino) guardarRegistro({ ...r, destino });
  }

  /** Correo de prueba desde Configuración. */
  async probar(nombreUsuario: string) {
    const para = await this.destino();
    if (!para) throw new BadRequestException('Primero escriba y guarde el correo que recibe los avisos');
    try {
      await enviarCorreo({
        para,
        asunto: 'SGTH: correo de prueba',
        texto: `Hola.\n\nEste es un correo de prueba enviado por ${nombreUsuario} desde Configuración.\nSi lo recibe, los avisos automáticos del SGTH llegarán a este correo.\n\nEquipo servidor: ${hostname()}\n` + pieAviso(await this.config.texto('url_sistema', '')),
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    this.guardarDestino(para);
    return { enviadoA: para };
  }

  /** Respaldo con error o atrasado y certificado HTTPS por vencer (una vez al día cada uno). */
  async revisarServidor(ahora = new Date()) {
    for (const a of avisosServidorDetalle(ahora)) {
      if (a.tipo === 'RESPALDO') await this.avisar('servidor:respaldo', 'problema con el respaldo diario', a.texto, 24);
      if (a.tipo === 'CERTIFICADO') await this.avisar('servidor:certificado', 'el certificado HTTPS no se ha renovado', a.texto, 24);
    }
  }

  /** Usuario bloqueado por claves erradas (como máximo un aviso por hora por usuario). */
  async usuarioBloqueado(usuario: string, nombre: string, ip: string | undefined, minutos: number) {
    await this.avisar(
      `bloqueo:${usuario}`,
      `usuario ${usuario} bloqueado por claves erradas`,
      `El usuario ${usuario} (${nombre}) quedó bloqueado ${minutos} minutos por escribir mal la clave varias veces seguidas.\n` +
        `Equipo desde el que se intentó: ${ip ?? 'desconocido'}\nFecha: ${fechaLocal()}\n\n` +
        'Si no fue esa persona, puede ser alguien intentando adivinar la clave. Hable con ella y, si hace falta, ' +
        'restablezca su clave en Administración › Usuarios. Los intentos quedan en Administración › Auditoría.',
      1,
    );
  }

  /** Muchos ingresos fallidos desde un mismo equipo en 15 minutos (como máximo un aviso por hora por equipo). */
  async revisarFallosPorEquipo(ip: string | undefined) {
    if (!ip || !modoCorreo()) return;
    const fila = await this.db.uno<{ n: number; usuarios: string | null }>(
      `SELECT COUNT(*) AS n,
              GROUP_CONCAT(DISTINCT COALESCE(u.usuario, JSON_UNQUOTE(JSON_EXTRACT(a.datos_despues, '$.usuario'))) SEPARATOR ', ') AS usuarios
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.accion = 'LOGIN_FALLIDO' AND a.ip = ? AND a.fecha >= NOW() - INTERVAL 15 MINUTE`,
      [ip],
    );
    if (!fila || Number(fila.n) < UMBRAL_FALLOS_IP) return;
    await this.avisar(
      `ip:${ip}`,
      'muchos intentos de ingreso fallidos desde un equipo',
      `En los últimos 15 minutos hubo ${fila.n} intentos de ingreso fallidos desde el equipo ${ip}.\n` +
        `Usuarios que intentaron: ${(fila.usuarios ?? '').slice(0, 500) || 'desconocidos'}\nFecha: ${fechaLocal()}\n\n` +
        'Si nadie de la oficina estaba teniendo problemas para entrar, informe a sistemas: puede ser alguien ' +
        'intentando adivinar claves. El detalle está en Administración › Auditoría (acción "Ingreso fallido").',
      1,
    );
  }
}

const fechaLocal = () => new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });
