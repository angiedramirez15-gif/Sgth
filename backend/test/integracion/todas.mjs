// Pruebas de integración del SGTH contra el backend en marcha y la base de PRUEBAS.
//   1. Inicie el backend:          npm run start:dev
//   2. En otra ventana, ejecute:   npm run test:integracion
// Crea sus propios datos (con la etiqueta PRB…) y tres usuarios de prueba (auto.admin, auto.th, auto.sst)
// que quedan inactivos al terminar. Se niega a correr si el .env apunta a la base de producción "sgth".
import { after } from 'node:test';
import { terminar } from './ayudante.mjs';

await import('./seguridad.test.mjs');
await import('./colaboradores.test.mjs');
await import('./inventario-actas.test.mjs');
await import('./permisos.test.mjs');
await import('./reportes-auditoria.test.mjs');

after(terminar);
