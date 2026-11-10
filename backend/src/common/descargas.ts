/** Cabecera Content-Disposition con nombre seguro (ASCII y UTF-8). */
export function disposicion(nombre: string, inline: boolean) {
  const ascii = nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'archivo';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}
