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

La especificación completa está en `docs/SGTH_Documentacion_v1.6.docx`.

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
de `database/cambios/` (por ejemplo `004_datos_adicionales_colaborador.sql`, `005_opcion_no_aplica.sql`, `006_inventario_placas_actas_antiguas.sql` y `007_actas_ubicacion_pie.sql`).
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

Pruebas automáticas: `npm test`

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
| Los stickers salen corridos al imprimir | En el diálogo de impresión del navegador escoja **Tamaño real** (escala 100 %), no "Ajustar a la página". La hoja es carta de 10 etiquetas de 4 × 2 pulgadas (tipo Avery 5163). |
| El QR del sticker no abre el sistema desde el celular | Revise en Configuración la **Dirección del sistema en la red**: debe ser la IP del portátil servidor, no `localhost`, y el celular debe estar en la misma red Wi-Fi. |
| La importación rechaza el número de documento, teléfono o cuenta | Si Excel lo convirtió en notación científica (1,67E+09), formatee esa columna como **Texto** y escríbalo de nuevo. |

## 7. Estructura

```
sgth/
├── backend/            NestJS
│   └── src/
│       ├── auth/           inicio de sesión, cambio de clave, JWT
│       ├── usuarios/       administración de usuarios y roles
│       ├── catalogos/      áreas, cargos, entidades, proveedores…
│       ├── colaboradores/  ficha, documentos, foto, importación desde Excel
│       ├── archivos/       guardar y leer archivos en C:\SGTH\archivos
│       ├── common/         permisos (@Permisos), decoradores, manejo de errores
│       ├── database/       conexión mysql2 y transacciones
│       ├── auditoria/      registro de cambios
│       ├── configuracion/  parámetros de la tabla configuracion
│       └── salud/          GET /api/salud
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
└── docs/               documentación y diagramas entidad-relación
```

## 8. Cómo se protege cada ruta del backend

Todas las rutas exigen sesión iniciada, salvo las marcadas con `@Publico()`.
Para exigir un permiso:

```ts
@Permisos('colaboradores.gestionar')
@Post()
crear(@Body() dto: CrearColaboradorDto, @UsuarioActual() u: UsuarioToken) { ... }
```

Los códigos de permiso están en la tabla `permisos` (script 02).

## 9. Flujo de trabajo con Git

- `main`: versión estable, la que está instalada en el servidor.
- `develop`: integración del trabajo en curso.
- `feature/<modulo>`: una rama por funcionalidad, que se une a `develop` al terminar.
- Cada cambio de base de datos va como un script nuevo en `database/cambios/`.
