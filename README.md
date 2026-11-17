# SGTH — Sistema de Gestión de Talento Humano

Sistema interno de **DRIM DUIT S.A.S.** para gestionar colaboradores, expediente documental,
dotación, Elementos de Protección Personal (EPP), equipos y muebles, con actas de entrega en el
formato corporativo.

| Parte | Tecnología | Carpeta |
|---|---|---|
| Interfaz | Angular 22 + Angular Material | `frontend/` |
| API | NestJS 12 (Node.js) | `backend/` |
| Base de datos | MariaDB (administrada con HeidiSQL) | `database/` |
| Documentación | Especificación, diagramas | `docs/` |

La especificación completa está en `docs/SGTH_Documentacion_v1.9.docx`.

---

## 1. Requisitos en el PC

- **Node.js 22 LTS o superior** — `node -v`
- **Git** — `git --version`
- **MariaDB Server 10.6+** y **HeidiSQL**
- **Visual Studio Code** (extensiones sugeridas: Angular Language Service, ESLint, Prettier)

> No es necesario instalar Angular CLI ni Nest CLI de forma global: cada proyecto trae su propia versión.

## 2. Base de datos

En HeidiSQL, conectado como `root`, ejecutar en orden los scripts de `database/`:

1. `01_esquema.sql` — crea la base `sgth` (27 tablas y 4 vistas).
2. `02_datos_iniciales.sql` — roles, permisos, usuario `admin`, catálogos y plantillas de acta.
3. `03_usuario_aplicacion.sql` — **antes de ejecutarlo**, cambie `CAMBIAR_ESTA_CLAVE` por una clave segura.
   Es el usuario con el que el backend se conecta a MariaDB.

**Cambios posteriores:** si la base se creó antes de una actualización, ejecute en orden los scripts nuevos
de `database/cambios/` (por ejemplo `004_datos_adicionales_colaborador.sql`, `005_opcion_no_aplica.sql`, `006_inventario_placas_actas_antiguas.sql`, `007_actas_ubicacion_pie.sql`, `008_planillas_epp.sql`, `009_alertas_descarte.sql`, `010_certificados_laborales.sql`, `011_seguridad_habeas_data.sql`, `012_base_pruebas_y_respaldo.sql`, `013_permisos_th_sst.sql` y `014_avisos_correo.sql`).
Se ejecutan conectado como **root** (sgth_app no puede cambiar tablas) y se pueden repetir sin error.
Una instalación nueva no los necesita: el script 01 ya los incluye.

El salario mínimo se registra después desde el sistema, en Administración, Configuración.

## 3. Backend (API)

```bash
cd backend
npm install
copy .env.example .env      # en Windows (en Linux/Mac: cp .env.example .env)
```

Abra `backend/.env` y complete:

- `DB_PASSWORD`: la clave que puso en el script 03.
- `JWT_SECRETO`: un texto aleatorio. Genérelo con:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Iniciar en modo desarrollo (se reinicia solo al guardar cambios):

```bash
npm run start:dev
```

Compruebe en el navegador: <http://localhost:3000/api/salud> debe mostrar `"baseDatos": "ok"`.

Pruebas automáticas:

- `npm test`: pruebas rápidas de las reglas del sistema (no necesitan la base de datos).
- `npm run test:integracion`: pruebas completas contra el backend en marcha (`npm run start:dev` en otra
  ventana) y la base **`sgth_pruebas`**: seguridad, permisos por rol, colaboradores, inventario, actas,
  reportes y auditoría. Crean sus propios datos (marcados `PRB…`) y los usuarios `auto.admin`, `auto.th`
  y `auto.sst`, que quedan inactivos al terminar. Se niegan a correr si el `.env` apunta a la base `sgth`.
  Córralas antes de instalar cada versión nueva.

## 4. Frontend (interfaz)

En otra terminal:

```bash
cd frontend
npm install
npm start
```

Abra <http://localhost:4200> e ingrese con:

- Usuario: `admin`
- Clave temporal: `Sgth2026*` (el sistema pedirá cambiarla en el primer ingreso)

En desarrollo, Angular reenvía las peticiones `/api` al backend (archivo `proxy.conf.json`),
así que el backend debe estar corriendo.

## 5. Primeros pasos en el sistema

Con el usuario `admin`, en el menú **Administración**:

1. **Configuración**: registre el salario mínimo vigente y revise los días de anticipación de las alertas.
2. **Catálogos**: cree las áreas y luego los cargos (cada cargo con su área y nivel de riesgo ARL).
   Revise también las EPS, ARL, fondos y cajas que vienen precargados.
3. **Catálogos, Cargos**: en el menú de cada cargo, marque sus **documentos obligatorios**.
4. **Usuarios**: cree la cuenta personal de cada persona (nombre completo, cargo y rol). El sistema
   genera una clave temporal que se muestra una sola vez para entregársela. Después, inactive el usuario
   `admin` genérico si ya tiene su propio usuario administrador.
5. **Colaboradores**: registre a los colaboradores uno por uno o use **Importar desde Excel**
   (descargue la plantilla después de crear los cargos y áreas, porque sus listas salen de los catálogos).
6. **Configuración, Dirección del sistema en la red**: escriba la dirección con la que los demás equipos abren
   el SGTH (por ejemplo `http://192.168.1.20:3000`). Va dentro del QR de los stickers de placa.
7. **Dotación**: cree los elementos (camisa, jean, botas…) marcando si se entregan por talla, y registre la
   entrada con lo que hay hoy en bodega.
8. **Equipos y muebles**: en la pestaña **Tipos** cree los tipos (computador portátil, celular, silla…); en
   **Con placa** registre cada unidad. El sistema asigna la placa (DD-EQ-0001, DD-MU-0001) y ofrece imprimir
   el sticker. Lo que se entrega sin placa (llaves, carnés) va en **Otros elementos**.
9. **Actas antiguas**: lo que ya estaba entregado antes del sistema se registra en **Actas › Acta antigua**,
   subiendo el acta escaneada. No descuenta stock y los equipos y muebles quedan con placa nueva.
10. **Entregas nuevas**: **Actas › Nueva entrega** (o desde la ficha del colaborador, pestaña Entregas).
    Al guardar se descuenta el inventario y se genera el PDF con el formato de la empresa. Se imprime,
    se firma y se sube escaneado con **Subir firmada**; mientras tanto el acta aparece como "Falta la firmada".
    Traspasos y devoluciones se hacen igual, desde Actas o desde la ficha del equipo.
11. **EPP** (rol SST): en **EPP › Inventario** cree cada EPP con su vida útil en días y registre la entrada;
    en **Matriz por cargo** marque qué EPP exige cada cargo. La pestaña **Por reponer** muestra lo vencido,
    lo que vence pronto y lo que el cargo exige y nunca se entregó. Al entregar un EPP, el anterior del mismo
    tipo queda como repuesto. **Entrega grupal** genera una sola planilla donde firman todas las personas.
12. **Alertas**: el sistema revisa al encender y cada hora los documentos vencidos o por vencer, contratos por
    terminar, EPP por reponer, dotación pendiente del período, actas sin la firmada y retirados con elementos
    sin devolver. El número junto a **Alertas** en el menú y la sección **Pendientes** del Inicio muestran
    cuántas hay. Cada alerta se quita sola cuando se soluciona la causa; si no aplica, se puede **descartar**
    escribiendo el motivo (queda en el historial quién y por qué, y se puede reactivar). Los días de
    anticipación se ajustan en **Configuración**. La dotación pendiente necesita el **salario mínimo** vigente.
13. **Reportes**: listados en Excel de colaboradores, documentos, entregas de dotación y EPP, existencias,
    equipos y muebles, y actas. Cada rol ve solo los reportes de su área; el salario sale solo si el rol puede
    ver datos sensibles.
14. **Certificados laborales**: en **Configuración › Certificados laborales** registre el NIT, el nombre y el
    cargo de quien firma, y suba la imagen de la firma. Luego, en la ficha del colaborador, **Certificado laboral**
    genera el PDF (con o sin salario, y dirigido a una entidad o "A quien interese"). Cada certificado queda con
    número CER-AAAA-NNNN en la pestaña **Certificados**. Para retirados dice "laboró desde … hasta …". El texto
    se edita en **Plantillas de actas › Certificado laboral**.
15. **Auditoría** (Administración): quién hizo qué y cuándo (ingresos, cambios, descargas y consultas de datos
    sensibles), con filtros por fechas, usuario, acción y módulo. Solo consulta.

### Qué ve cada rol

| Rol | Ve y gestiona | No ve |
|---|---|---|
| Administrador | Todo | — |
| Talento Humano | Colaboradores (con salarios y datos sensibles), dotación, EPP, equipos y muebles, todas las actas, certificados, alertas (incluidas las de SST), reportes, catálogos y auditoría | Usuarios, Configuración y editar plantillas de actas |
| SST | Colaboradores (sin salario ni datos sensibles), documentos de SST, inventario de EPP, matriz y planillas de EPP, solo las actas de EPP, alertas de SST y reportes de su área | Dotación, equipos y muebles, actas que no sean de EPP, plantillas, administración |

Los permisos de una base existente se ajustan con `database/cambios/013_permisos_th_sst.sql` (como root).
Las personas de Talento Humano y SST deben volver a ingresar después de ejecutarlo.

## 6. Problemas comunes

| Síntoma | Solución |
|---|---|
| `npm install` falla con `Cannot read properties of null (reading 'edgesOut')` | Es un error del npm que trae Node 22. Use `npx npm@11 install`, o actualice npm con `npm install -g npm@11`. |
| `/api/salud` muestra `"baseDatos": "sin conexión"` | Verifique que el servicio MariaDB esté iniciado y los datos `DB_*` del `.env`. |
| Error `unknown plugin auth_gssapi_client` | MariaDB no encuentra al usuario `sgth_app` para `127.0.0.1`, o la clave no coincide. Ejecute de nuevo `database/03_usuario_aplicacion.sql`. |
| PowerShell no deja ejecutar `npm` | Use `npm.cmd`, o ejecute una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| El backend no arranca: `JWT_SECRETO ... al menos 32 caracteres` | Complete `JWT_SECRETO` en `.env` (sección 3). |
| En el login: "No hay conexión con el servidor del SGTH" | El backend no está corriendo: ejecute `npm run start:dev` en `backend/`. |
| La importación dice que un cargo, área o entidad "no existe en los catálogos del sistema" | Créelo en Administración, Catálogos, o escriba en el Excel el nombre exacto de la lista desplegable. La página muestra arriba el resumen de todo lo que falta. Abreviaturas como "Sura" por "EPS Sura" se reconocen solas. |
| El PDF del acta sale con la dirección del pie con símbolos raros (Ã, â€“) | El script se ejecutó con otra codificación. En Configuración, corrija el **Pie de página de las actas** y guarde; los PDF nuevos salen bien. |
| No deja anular un acta: "tuvo movimientos después de esta acta" | Algún equipo de esa acta ya se traspasó o devolvió después. Anule primero el acta más reciente y luego esta. |
| Los stickers salen corridos al imprimir | En el diálogo de impresión del navegador escoja **Tamaño real** (escala 100 %), no "Ajustar a la página". La hoja es carta de 30 etiquetas de 6,7 × 2,5 cm (tipo Avery 5160). |
| El QR del sticker no abre el sistema desde el celular | Revise en Configuración la **Dirección del sistema en la red**: debe ser la IP del portátil servidor, no `localhost`, y el celular debe estar en la misma red Wi-Fi. |
| La importación rechaza el número de documento, teléfono o cuenta | Si Excel lo convirtió en notación científica (1,67E+09), formatee esa columna como **Texto** y escríbalo de nuevo. |

## 7. Estructura

```
sgth/
├── backend/            NestJS
│   └── src/
│       ├── auth/           ingreso, doble verificación, cookie de sesión, cambio de clave
│       ├── usuarios/       administración de usuarios y roles
│       ├── catalogos/      áreas, cargos, entidades, proveedores…
│       ├── colaboradores/  ficha, documentos, foto, importación desde Excel
│       ├── archivos/       guardar y leer archivos en C:\SGTH\archivos
│       ├── common/         permisos (@Permisos), decoradores, manejo de errores
│       ├── database/       conexión mysql2 y transacciones
│       ├── auditoria/      registro de cambios y consulta (pantalla Auditoría)
│       ├── configuracion/  parámetros de la tabla configuracion
│       ├── inventario/     dotación, EPP, equipos y muebles, stickers
│       ├── actas/          actas, plantillas, PDF, matriz y planillas de EPP
│       ├── alertas/        cálculo y gestión de alertas
│       ├── certificados/   certificados laborales
│       ├── correo/         avisos por correo (Microsoft Graph o SMTP)
│       ├── seguridad/      doble verificación, cifrado, reglas de claves, compromiso
│       ├── reportes/       reportes en Excel
│       └── salud/          GET /api/salud
│   ├── scripts/        respaldo.mjs, restaurar.mjs (respaldo cifrado) y vigilante.mjs (sistema caído)
│   └── test/integracion/  pruebas completas (npm run test:integracion)
├── frontend/           Angular
│   ├── public/marca/       logo e isotipo de DRIM DUIT
│   └── src/
│       ├── styles.scss     tema con los colores corporativos
│       └── app/
│           ├── core/       sesión, interceptor del token, guards, menú
│           ├── layout/     menú lateral y barra superior
│           ├── shared/     confirmaciones y mensajes
│           └── features/   pantallas (ingreso, cambiar clave, inicio, módulos)
├── database/           scripts SQL en orden de ejecución
├── despliegue/         scripts de Windows y guía de puesta en marcha (Fase 7)
└── docs/               documentación y diagramas entidad-relación
```

## 8. Seguridad y protección de datos (Ley 1581 de 2012)

- **Sesión:** viaja en una cookie que JavaScript no puede leer (HttpOnly, SameSite=Strict). Vence con los
  minutos de inactividad de Configuración y dura como máximo 12 horas. Se cierra en todos los equipos al
  inactivar el usuario, cambiar su rol o su clave, o reiniciar su doble verificación.
- **Doble verificación:** obligatoria para los roles que ven salarios y datos sensibles (Administrador y
  Talento Humano). El primer ingreso muestra un código QR para Google Authenticator o Microsoft Authenticator,
  y entrega 8 códigos de respaldo. Si alguien pierde el celular, otro administrador usa **Usuarios › Reiniciar
  doble verificación**. El menú de la cuenta permite generar códigos de respaldo nuevos.
- **Claves:** mínimo 12 caracteres con letras y números; no se aceptan claves comunes, con el nombre o el
  usuario, ni las últimas 5. Vencen a los 90 días (Configuración › Seguridad).
- **Compromiso de confidencialidad:** cada usuario lo acepta en su primer ingreso; queda la fecha y el equipo.
  Se edita en Configuración › Seguridad; cada cambio crea una versión y todos deben aceptarla otra vez.
- **Autorización de tratamiento de datos:** es obligatoria para todos los colaboradores (catálogo de tipos de
  documento, "Obligatorio para todos"). Si falta, aparece como faltante y genera la alerta "Sin autorización de datos".
- **Protecciones del servidor:** cabeceras de seguridad (el navegador solo ejecuta el código del SGTH y no
  permite mostrarlo dentro de otra página), protección contra solicitudes falsificadas (cabecera `X-SGTH`),
  máximo 10 intentos de ingreso por minuto por equipo y 600 peticiones por minuto, respuestas sin caché.
- **HTTPS:** el backend ya lo soporta (`HTTPS_PFX` en `.env`); se activa en la Fase 7. **No use el sistema con
  datos reales en la red sin HTTPS.**
- **Lo que no hace el software:** la empresa debe tener su Política de Tratamiento de Datos aprobada, el formato
  de autorización firmado por cada colaborador y revisar si debe inscribir sus bases de datos en el RNBD de la SIC.

## 9. Puesta en marcha en la red (Fase 7)

La guía paso a paso está en **`despliegue/GUIA_PUESTA_EN_MARCHA.md`**. Resumen:

- **Versión en uso** en `C:\SGTH\app` (base `sgth`), separada del desarrollo en `C:\Proyectos\SGTH`
  (base `sgth_pruebas`). Se instala y actualiza con `despliegue\2-instalar-o-actualizar.ps1`.
- **Dirección:** `https://sgth.<dominio de la empresa>`, con certificado gratuito de Let's Encrypt (win-acme +
  acme-dns, registro CNAME en GoDaddy). Se renueva solo y el SGTH lo carga sin reiniciarse.
- **Arranque automático:** tarea programada "SGTH - Sistema" (cuenta SYSTEM), se reinicia sola si se detiene.
- **Respaldo diario cifrado** a las 12:30 p. m. a OneDrive de la empresa (`backend/scripts/respaldo.mjs`):
  base de datos completa y documentos nuevos, AES-256-GCM, 30 días + 1 por mes durante 12 meses. Se restaura con
  `backend/scripts/restaurar.mjs`. El Inicio avisa al administrador si el respaldo falla o el certificado no se renovó.
- **Avisos por correo** (Configuración › Avisos por correo): respaldo con error o atrasado, certificado sin
  renovar, sistema caído (tarea "SGTH - Vigilante", cada 15 minutos, `backend/scripts/vigilante.mjs`) e ingresos
  sospechosos (usuario bloqueado, o 10 intentos fallidos desde un equipo en 15 minutos). Salen por Microsoft Graph
  (`CORREO_MODO=graph`) o SMTP (`CORREO_MODO=smtp`); cada aviso se repite como máximo una vez al día (los de
  ingresos, una vez por hora).
- **Firewall:** 443 y 80 solo desde la red local; MariaDB bloqueado desde otros equipos.

## 10. Cómo se protege cada ruta del backend

Todas las rutas exigen sesión iniciada, salvo las marcadas con `@Publico()`.
Para exigir un permiso:

```ts
@Permisos('colaboradores.gestionar')
@Post()
crear(@Body() dto: CrearColaboradorDto, @UsuarioActual() u: UsuarioToken) { ... }
```

Los códigos de permiso están en la tabla `permisos` (script 02).

## 11. Flujo de trabajo con Git

- `main`: versión estable, la que está instalada en el servidor.
- `develop`: integración del trabajo en curso.
- `feature/<modulo>`: una rama por funcionalidad, que se une a `develop` al terminar.
- Cada cambio de base de datos va como un script nuevo en `database/cambios/`.
