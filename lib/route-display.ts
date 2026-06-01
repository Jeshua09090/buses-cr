const ACRONYMS = ['ITCR', 'TEC', 'ICE', 'INA', 'UCR', 'CTP', 'OIJ', 'AMPM'];

export function formatRouteDisplayName(value?: string | null) {
  if (!value) return 'Ruta disponible';

  let display = value
    .toLocaleLowerCase('es-CR')
    .replace(/(^|[\s/-])([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toLocaleUpperCase('es-CR')}`;
    });

  for (const acronym of ACRONYMS) {
    display = display.replace(new RegExp(`\\b${acronym}\\b`, 'gi'), acronym);
  }

  return display;
}

export function getRouteDisplayNote(value?: string | null) {
  const routeText = (value ?? '').toLocaleUpperCase('es-CR');
  if (!/\b(?:SAN JOSE - ITCR|ITCR - SAN JOSE)\b/.test(routeText)) return null;

  return 'ITCR en el snapshot local corresponde a la ruta publica CTP 0300-P; Moovit tambien lista el bus estudiantil Cartago-Campus TEC con salida unica.';
}
