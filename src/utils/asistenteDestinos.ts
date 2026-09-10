// ════════════════════════════════════════════════════════════════════════
// asistenteDestinos.ts — catálogo de sitios a los que el Asistente Gradly
// puede OFRECER llevar al usuario (fase 2, núcleo: solo rutas y pestañas).
//
// El bot nunca navega solo: propone un botón "Ir a X →" en el chat y el
// usuario decide. El despachador (`irADestino`) SOLO navega — no hay ninguna
// función de enviar/aceptar/borrar aquí ni a la que se pueda llegar desde aquí.
//
// Las claves de este archivo se replican en el `enum` de la tool `irA` de
// functions/src/chatbot.ts: si agregas/quitas una, actualiza también allá.
// ════════════════════════════════════════════════════════════════════════

import type { Router } from "expo-router";

type Rol = "estudiante" | "empresa" | "universidad";

export type DestinoAsistente =
  | "mensajes"
  | "ayuda"
  | "miPerfil"
  | "progreso"
  | "buscarVacantes"
  | "institucion"
  | "misVacantes"
  | "pasantesEmpresa"
  | "misEstudiantes"
  | "aprobaciones";

interface DestinoDef {
  /** Etiqueta para el botón "Ir a …" (se traduce con AutoText). */
  label: string;
  /** Roles que pueden ver/usar este destino. */
  roles: Rol[];
  /** Navegación. `setParams` cambia la sección del dashboard sin cambiar de ruta. */
  run: (router: Router, rol: Rol) => void;
}

export const DESTINOS_ASISTENTE: Record<DestinoAsistente, DestinoDef> = {
  mensajes: {
    label: "Mensajes",
    roles: ["estudiante", "empresa", "universidad"],
    run: (router, rol) => {
      if (rol === "estudiante") router.push("/(tabs)/mensajes" as any);
      else router.push("/mensajes" as any);
    },
  },
  ayuda: {
    label: "Ayuda",
    roles: ["estudiante", "empresa", "universidad"],
    run: (router) => router.push("/help-gradly" as any),
  },
  miPerfil: {
    label: "Mi perfil",
    roles: ["estudiante", "empresa", "universidad"],
    run: (router, rol) => {
      if (rol === "estudiante") router.push("/(tabs)/perfil" as any);
      else router.setParams?.({ seccion: "perfil" } as any);
    },
  },
  progreso: {
    label: "Mi progreso",
    roles: ["estudiante"],
    run: (router) => router.push("/(tabs)/progreso" as any),
  },
  buscarVacantes: {
    label: "Buscar vacantes",
    roles: ["estudiante"],
    run: (router) => router.push("/(tabs)" as any),
  },
  institucion: {
    label: "Mi institución",
    roles: ["estudiante"],
    run: (router) => router.push("/(tabs)/institucion" as any),
  },
  misVacantes: {
    label: "Mis vacantes",
    roles: ["empresa"],
    run: (router) => router.setParams?.({ seccion: "vacantes" } as any),
  },
  pasantesEmpresa: {
    label: "Pasantes activos",
    roles: ["empresa"],
    run: (router) => router.setParams?.({ seccion: "activas" } as any),
  },
  misEstudiantes: {
    label: "Mis estudiantes",
    roles: ["universidad"],
    run: (router) => router.setParams?.({ seccion: "estudiantes" } as any),
  },
  aprobaciones: {
    label: "Aprobaciones",
    roles: ["universidad"],
    run: (router) => router.setParams?.({ seccion: "aprobar" } as any),
  },
};

/** Claves válidas para un rol (para filtrar lo que devuelve el bot). */
export function destinosDeRol(rol?: string | null): DestinoAsistente[] {
  return (Object.keys(DESTINOS_ASISTENTE) as DestinoAsistente[]).filter((k) =>
    DESTINOS_ASISTENTE[k].roles.includes(rol as Rol),
  );
}

/** Ejecuta la navegación de un destino, si es válido para el rol. */
export function irADestino(
  destino: string,
  ctx: { router: Router; rol?: string | null },
): boolean {
  const def = (DESTINOS_ASISTENTE as Record<string, DestinoDef>)[destino];
  if (!def || !def.roles.includes(ctx.rol as Rol)) return false;
  try {
    def.run(ctx.router, ctx.rol as Rol);
    return true;
  } catch {
    return false;
  }
}

export function labelDestino(destino: string): string {
  return (DESTINOS_ASISTENTE as Record<string, DestinoDef>)[destino]?.label ?? "";
}
