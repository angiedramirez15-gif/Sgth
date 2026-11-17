# SGTH – Guía de puesta en marcha (Fase 7)

Deja el SGTH funcionando en la red de la oficina, con HTTPS, arranque automático y
respaldo diario cifrado. Siga los pasos **en orden**. Los que dicen *(administrador)*
se hacen en PowerShell abierto con **clic derecho › Ejecutar como administrador**.

En esta guía, `sgth.miempresa.com` representa la dirección final: cámbiela por
`sgth.` + el dominio real de la empresa (el de los correos).

| Qué | Dónde queda |
|---|---|
| Versión en uso (la que usan todos) | `C:\SGTH\app` con la base de datos `sgth` |
| Documentos | `C:\SGTH\archivos` |
| Certificado HTTPS | `C:\SGTH\certificado` |
| Registros (logs) | `C:\SGTH\logs\sgth.log` y `respaldo.log` |
| Respaldos | OneDrive de la empresa › `SGTH-Respaldos` (y los últimos 7 en `C:\SGTH\respaldos`) |
| Desarrollo y pruebas | `C:\Proyectos\SGTH` con la base de datos `sgth_pruebas` |

---

## Paso 0. Antes de empezar

Necesita:

- Acceso a la cuenta de **GoDaddy** de la empresa.
- **OneDrive de la empresa** iniciado en el portátil (el ícono de nube azul junto al reloj).
- El **celular** con la app de autenticación (su usuario tiene doble verificación).
- Una mañana con poco uso del sistema (hay que detenerlo unos minutos).

Envíe este mensaje a TI y espere su respuesta (lo que piden se hace una sola vez):

> Hola. Vamos a dejar el Sistema de Gestión de Talento Humano (SGTH) funcionando en el
> portátil ASUS de Angie Ramírez, que hará de servidor dentro de la red. Necesitamos:
>
> 1. **Reservar una IP fija** para el portátil en el router (reserva DHCP). La MAC y la IP
>    actual las muestra el script `1-preparar-servidor.ps1`; se las enviamos.
> 2. **Permitir en el antivirus Datto**: `C:\Program Files\nodejs\node.exe`,
>    `C:\SGTH\win-acme\wacs.exe` y la carpeta `C:\SGTH`. El portátil recibirá conexiones
>    en los puertos **443 y 80** solo desde la red local.
> 3. Confirmar que el disco del portátil está **cifrado con BitLocker** (guarda datos
>    personales y de salud de los colaboradores; Ley 1581 de 2012).
> 4. Si el router de la oficina bloquea respuestas DNS con IP privadas ("DNS rebinding
>    protection"), permitir el dominio `sgth.<dominio de la empresa>`.
>
> Gracias.

---

## Paso 1. Preparar el portátil *(administrador)*

1. Detenga el backend y el frontend de desarrollo (Ctrl + C en sus ventanas).
2. Ejecute:
   ```powershell
   cd C:\Proyectos\SGTH\despliegue
   powershell -ExecutionPolicy Bypass -File .\1-preparar-servidor.ps1
   ```
3. Lea los avisos amarillos (si los hay) y envíe a TI la **MAC** que aparece al final.
4. **Reinicie** el portátil (para el nombre nuevo SGTH-SERVIDOR).

Desde ahora `C:\SGTH` solo se abre como administrador: es a propósito, porque ahí están
los documentos de los colaboradores.

## Paso 2. Base de pruebas y usuario de respaldo (HeidiSQL como root)

1. Abra `database\cambios\012_base_pruebas_y_respaldo.sql` en HeidiSQL.
2. Reemplace las 4 veces `CAMBIAR_CLAVE_RESPALDO` por una clave larga (anótela: se pide en el paso 3).
3. Ejecute. Debe salir `sgth_pruebas` y dos filas de `sgth_respaldo`.
4. Cierre la pestaña **sin guardar** el archivo (para que la clave no quede escrita).

## Paso 3. Instalar la versión en uso *(administrador)*

```powershell
cd C:\Proyectos\SGTH\despliegue
powershell -ExecutionPolicy Bypass -File .\2-instalar-o-actualizar.ps1
```

El script compila, corre las pruebas, copia todo a `C:\SGTH\app` y:

- Crea el `.env` de producción copiando las claves del `.env` de desarrollo.
- Pide la clave de `sgth_respaldo` (la del paso 2).
- Muestra **una sola vez** la **clave de los respaldos**. Guárdela **fuera del portátil**
  (en un gestor de contraseñas o en papel en un lugar seguro). Sin ella no se puede
  restaurar ningún respaldo.
- Registra las tareas programadas y arranca el SGTH.

Guarde también, en el mismo lugar seguro, una **copia del archivo
`C:\SGTH\app\backend\.env`**: tiene las claves que se necesitan si el portátil se daña.

Compruebe en el portátil: abra `http://localhost`, entre con su usuario y su código.
(Todavía es http; el candado llega en el paso 5.)

## Paso 4. Registro del dominio en GoDaddy

Cuando TI confirme la IP fija (por ejemplo `192.168.1.50`):

1. Entre a GoDaddy › **Mi cuenta › Mis productos** › en el dominio, **DNS** (o *Administrar DNS*).
2. **Agregar nuevo registro**:
   - Tipo: **A**
   - Nombre: **sgth**
   - Valor: **la IP fija del portátil**
   - TTL: 1 hora
3. Guardar. No toque los registros existentes (MX, TXT…): son los de los correos.

## Paso 5. Certificado HTTPS *(administrador)*

1. Descargue **win-acme** desde https://www.win-acme.com (botón de descarga, versión
   **x64 trimmed**). Descomprima el zip en `C:\SGTH\win-acme` (debe quedar
   `C:\SGTH\win-acme\wacs.exe`).
2. Ejecute (con el dominio y correo reales):
   ```powershell
   cd C:\Proyectos\SGTH\despliegue
   powershell -ExecutionPolicy Bypass -File .\4-certificado.ps1 -Dominio sgth.miempresa.com -Correo sistemas@miempresa.com
   ```
3. El script muestra qué elegir en el menú de win-acme. Cuando win-acme muestre un
   registro **CNAME**, vaya a GoDaddy y agréguelo:
   - Tipo: **CNAME**
   - Nombre: **_acme-challenge.sgth**
   - Valor: el que muestra win-acme (termina en `.auth.acme-dns.io`)
4. Espere 10 a 15 minutos y presione Enter en win-acme. Si dice que no lo encuentra,
   espere unos minutos más y reintente.
5. Al terminar (Q para salir), el script configura el SGTH en `https://sgth.miempresa.com`.

El certificado dura unas semanas y **se renueva solo**: win-acme crea su propia tarea
programada y el SGTH carga el certificado nuevo sin reiniciarse. Si algún día no se
renueva, el SGTH muestra un aviso al administrador en la pantalla de Inicio.

## Paso 6. Dirección del sistema y stickers definitivos

1. Entre a `https://sgth.miempresa.com` › **Administración › Configuración**.
2. **Dirección del sistema en la red** = `https://sgth.miempresa.com` › Guardar.
3. Ahora sí, imprima los **stickers definitivos** (Equipos y muebles › Stickers). Los
   de prueba que imprimió antes tienen la dirección vieja: deséchelos.

## Paso 7. Comprobar desde otro PC

Copie `despliegue\5-verificar.ps1` (en una memoria USB, por ejemplo) al PC de otra
persona y ejecútelo ahí en PowerShell normal:

```powershell
powershell -ExecutionPolicy Bypass -File .\5-verificar.ps1 -Dominio sgth.miempresa.com
```

Debe decir que el certificado es válido y que la base de datos funciona. Si dice que no
encuentra el nombre, en ese PC (como administrador):

```powershell
.\5-verificar.ps1 -Dominio sgth.miempresa.com -AgregarHosts -IP 192.168.1.50
```

## Paso 8. Primer respaldo y prueba de restauración *(administrador)*

1. Haga el primer respaldo sin esperar a las 12:30:
   ```powershell
   Start-ScheduledTask -TaskPath \SGTH\ -TaskName 'SGTH - Respaldo diario'
   ```
2. Al minuto, revise `C:\SGTH\logs\respaldo.log` (debe terminar en *Respaldo terminado*)
   y que en OneDrive aparezca `SGTH-Respaldos` con la nube de "sincronizado".
3. Compruebe que la clave abre el respaldo:
   ```powershell
   cd C:\SGTH\app\backend
   node scripts\restaurar.mjs probar
   ```

## Paso 9. Separar el desarrollo

A partir de aquí, lo que haga en `C:\Proyectos\SGTH` **no toca** los datos reales.

1. Llene la base de pruebas con una copia del último respaldo (pide la clave de root):
   ```powershell
   cd C:\SGTH\app\backend
   node scripts\restaurar.mjs base --importar sgth_pruebas
   ```
2. Edite `C:\Proyectos\SGTH\backend\.env` (el de desarrollo):
   ```
   DB_NAME=sgth_pruebas
   ARCHIVOS_DIR=C:\Proyectos\SGTH\archivos-pruebas
   ```
3. Para desarrollar, siga usando `npm run start:dev` y `ng serve` como siempre
   (puertos 3000 y 4200; no chocan con la versión en uso).

La base de pruebas tiene una copia de datos reales: no la comparta ni la saque del portátil.

## Paso 10. Usuarios y capacitación

1. En **Usuarios**, cree el usuario de cada persona con su rol. El sistema da una clave
   temporal: entréguesela en persona.
2. Cree un **segundo administrador** (persona de confianza) para poder reiniciar su doble
   verificación si pierde el celular.
3. Cada persona, en su primer ingreso: cambia la clave temporal, acepta el compromiso de
   confidencialidad y, si es de Talento Humano o administrador, activa la doble verificación.
4. Puntos para la capacitación:
   - La dirección `https://sgth.miempresa.com` (guardarla en favoritos).
   - Cerrar sesión al dejar el equipo; la sesión se cierra sola por inactividad.
   - No compartir usuario, clave ni código; guardar los códigos de respaldo.
   - Cargar la **autorización de tratamiento de datos** firmada de cada colaborador.
   - Qué hacer con las alertas: resolverlas o descartarlas con el motivo.

---

## Operación del día a día

| Cuándo | Qué |
|---|---|
| Todos los días | Portátil prendido, con el cargador, en la oficina y conectado a la red. Puede tener la tapa cerrada. |
| Al entrar al SGTH | Si en **Inicio** aparece un aviso de respaldo o certificado, atiéndalo ese día. |
| Cada mes | Prueba de restauración: `node scripts\restaurar.mjs probar` (desde `C:\SGTH\app\backend`, como administrador). |
| Vacaciones o ausencias | Alguien debe dejar el portátil prendido en la oficina, o el sistema no estará disponible. |

### Instalar una versión nueva

1. Termine y pruebe el cambio en desarrollo (base `sgth_pruebas`); haga commit y push.
2. Si trae un cambio de base de datos (`database\cambios\0XX_...sql`), ejecútelo en
   HeidiSQL como root **en las dos bases**: tal cual (base `sgth`) y otra vez cambiando
   la línea `USE sgth;` por `USE sgth_pruebas;`.
3. Ejecute *(administrador)* `.\2-instalar-o-actualizar.ps1`. El sistema se detiene
   menos de un minuto.

### Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| Nadie puede entrar | ¿El portátil está prendido y en la red? En el portátil abra `https://sgth.miempresa.com`. Revise `C:\SGTH\logs\sgth.log`. |
| El sistema no arrancó después de reiniciar | Programador de tareas › SGTH › "SGTH - Sistema" › Ejecutar. Revise que el servicio de MariaDB esté iniciado. |
| Un PC no encuentra la dirección | `5-verificar.ps1` en ese PC; si hace falta, `-AgregarHosts`. |
| Aviso "El último respaldo falló" | Revise `C:\SGTH\logs\respaldo.log` (clave de `sgth_respaldo`, OneDrive, espacio en disco). |
| Aviso de certificado por vencer | Programador de tareas › tarea "win-acme renew" › historial. Ejecute `C:\SGTH\win-acme\wacs.exe` › "R: Run renewals". |
| Perdió el celular | Otro administrador: Usuarios › Reiniciar doble verificación. |

### Si el portátil se daña o lo roban

1. En el equipo nuevo instale Node.js, MariaDB, Git y HeidiSQL; clone el repositorio en
   `C:\Proyectos\SGTH`; ejecute `database\03_usuario_aplicacion.sql` y el cambio 012.
2. Haga los pasos 1 y 3 de esta guía.
3. Restaure la base y los documentos desde OneDrive (necesita la **clave de los respaldos**):
   ```powershell
   cd C:\SGTH\app\backend
   node scripts\restaurar.mjs base --importar sgth --confirmar-produccion
   node scripts\restaurar.mjs archivos --destino C:\SGTH\archivos
   ```
4. Cambie el registro A de GoDaddy a la IP del equipo nuevo y haga el paso 5.
5. Si `JWT_SECRETO` no es el mismo de antes, cada usuario debe volver a activar la doble
   verificación (un administrador la reinicia en Usuarios).
