/**
 * Permite `import 'algo.css'` como efecto secundario (Metro web lo resuelve;
 * TypeScript no trae tipos para archivos CSS). Usado, p.ej., por
 * `src/components/MapViewer.web.tsx` para cargar el CSS de Leaflet.
 */
declare module '*.css';
