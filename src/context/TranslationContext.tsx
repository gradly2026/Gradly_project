import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';

// ═══════════════════════════════════════════
// CADENAS DE TEXTO — español como idioma principal
// ═══════════════════════════════════════════
const ES = {
  // ── Comunes
  common: {
    aceptar: 'Aceptar',
    cancelar: 'Cancelar',
    guardar: 'Guardar',
    eliminar: 'Eliminar',
    editar: 'Editar',
    cerrar: 'Cerrar',
    volver: '← Volver',
    cargando: 'Cargando...',
    error: 'Error',
    exito: 'Éxito',
    sinConexion: 'Sin conexión. Verifica tu internet.',
    campoRequerido: 'Este campo es obligatorio.',
    correoInvalido: 'Ingresa un correo electrónico válido.',
    contrasenaCorta: 'La contraseña debe tener al menos 8 caracteres.',
    contrasenaNoCoincide: 'Las contraseñas no coinciden.',
    intentaMasTarde: 'Demasiados intentos. Intenta más tarde.',
    ver: 'Ver',
    aplicar: 'Aplicar',
    confirmar: 'Confirmar',
  },

  // ── Autenticación
  auth: {
    bienvenido: 'Bienvenido de nuevo',
    ingresaTusDatos: 'Ingresa tus datos para continuar',
    correo: 'Correo electrónico',
    contrasena: 'Contraseña',
    mostrarContrasena: 'Mostrar contraseña',
    ocultarContrasena: 'Ocultar contraseña',
    iniciarSesion: 'Iniciar Sesión',
    olvidasteContrasena: '¿Olvidaste tu contraseña?',
    sinCuenta: '¿No tienes cuenta?',
    registrateAqui: 'Regístrate aquí',
    credencialesInvalidas: 'Correo o contraseña incorrectos.',
    usuarioNoEncontrado: 'No existe una cuenta con ese correo.',
    errorLogin: 'Error al iniciar sesión.',

    // Recuperación
    recuperarAcceso: 'Recuperar acceso',
    descripcionMagicLink:
      'Te enviaremos un enlace mágico a tu correo para que puedas ingresar sin contraseña.',
    enviarEnlaceMagico: 'Enviar enlace mágico',
    enlaceEnviado: 'Enlace enviado',
    enlaceEnviadoDesc:
      'Revisa tu correo y haz clic en el enlace para ingresar.',
    errorEnvioEnlace: 'No se pudo enviar el enlace.',
    confirmaCorreo: 'Confirma tu correo',
    confirmaCorreoDesc:
      'Ingresa el correo con el que solicitaste el enlace mágico.',

    // Registro
    crearCuenta: 'Crear cuenta',
    tipoCuenta: 'Tipo de cuenta',
    empresa: 'Empresa',
    universidad: 'Universidad',
    nombreEmpresa: 'Nombre de empresa',
    nit: 'NIT',
    industria: 'Industria',
    nombreUniversidad: 'Nombre de universidad',
    dominioCorreo: 'Dominio de correo (ej. @uca.edu.sv)',
    nombreContacto: 'Nombre del contacto',
    confirmarContrasena: 'Confirmar contraseña',
    registrarme: 'Registrarme',
    yaTengosCuenta: '¿Ya tienes cuenta?',
    iniciarSesionAqui: 'Inicia sesión aquí',
    cuentaCreadaExito: 'Cuenta creada exitosamente.',
    errorRegistro: 'No se pudo crear la cuenta.',
  },

  // ── Tabs / Navegación
  tabs: {
    vacantes: 'Vacantes',
    progreso: 'Progreso',
    academia: 'Academia',
    perfil: 'Perfil',
    inicio: 'Inicio',
  },

  // ── Vacantes
  vacantes: {
    titulo: 'Vacantes disponibles',
    sinVacantes: 'No hay vacantes disponibles en este momento.',
    buscar: 'Buscar vacantes...',
    filtrar: 'Filtrar',
    modalidad: 'Modalidad',
    presencial: 'Presencial',
    remoto: 'Remoto',
    hibrido: 'Híbrido',
    tipo: 'Tipo',
    pasantia: 'Pasantía',
    proyecto: 'Proyecto',
    tiempoParcial: 'Tiempo parcial',
    horasRequeridas: 'Horas requeridas',
    horasSemanales: 'Horas semanales',
    aplicar: 'Aplicar ahora',
    fechaLimite: 'Fecha límite',
    publicado: 'Publicado',
    aplicantes: 'aplicantes',
    contratados: 'contratados',
  },

  // ── Progreso (termómetro de horas)
  progreso: {
    titulo: 'Mi progreso',
    horasAprobadas: 'Horas aprobadas',
    horasEnProceso: 'En proceso',
    horasRestantes: 'Restantes',
    horasObjetivo: 'Objetivo',
    metaAlcanzada: '¡Meta alcanzada!',
    porcentajeCompletado: 'completado',
    misPasantias: 'Mis pasantías',
    sinPasantias: 'Aún no tienes pasantías registradas.',
  },

  // ── Academia (cursos / recursos)
  academia: {
    titulo: 'Academia Gradly',
    subtitulo: 'Prepárate para tu pasantía',
    cursosSugeridos: 'Cursos sugeridos para ti',
    proximamente: 'Próximamente',
    sinCursos: 'No hay cursos disponibles aún.',
  },

  // ── Perfil
  perfil: {
    titulo: 'Mi perfil',
    editarPerfil: 'Editar perfil',
    subirCV: 'Subir CV',
    cambiarFoto: 'Cambiar foto',
    cerrarSesion: 'Cerrar sesión',
    confirmaCierreSesion: '¿Seguro que quieres cerrar sesión?',
    datos: 'Mis datos',
    habilidades: 'Habilidades',
    calificacion: 'Calificación',
    linkedin: 'LinkedIn',
    portfolio: 'Portfolio',
  },

  // ── Dashboards
  dashboards: {
    adminTitulo: 'Panel de Administración',
    empresaTitulo: 'Panel de Empresa',
    universidadTitulo: 'Panel de Universidad',
    bienvenida: (nombre: string) => `Bienvenido, ${nombre}`,
  },

  // ── Errores de Firebase
  firebase: {
    wrongPassword:     'Correo o contraseña incorrectos.',
    userNotFound:      'No existe una cuenta con ese correo.',
    tooManyRequests:   'Demasiados intentos. Intenta más tarde.',
    networkError:      'Sin conexión. Verifica tu internet.',
    emailAlreadyInUse: 'Ese correo ya está registrado.',
    weakPassword:      'La contraseña es demasiado débil.',
    invalidEmail:      'El correo no tiene un formato válido.',
    unknownError:      'Ocurrió un error inesperado.',
  },
} as const;

export type Strings = typeof ES;

// ═══════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════
interface TranslationContextValue {
  t: Strings;
  language: 'es';
  // Legado — devuelve el texto tal cual (la app es español fijo)
  translateText: (text: string) => Promise<string>;
  getTranslation: (text: string) => Promise<string>;
}

const TranslationContext = createContext<TranslationContextValue>({
  t: ES,
  language: 'es',
  translateText: async (text) => text,
  getTranslation: async (text) => text,
});

export const TranslationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [language] = useState<'es'>('es');

  const value = useMemo<TranslationContextValue>(
    () => ({
      t: ES,
      language,
      translateText: async (text: string) => text,
      getTranslation: async (text: string) => text,
    }),
    [language],
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

/** Hook principal — accede a las cadenas con t.modulo.clave */
export const useTranslation = () => useContext(TranslationContext);

/** Alias de compatibilidad con código anterior */
export const useTranslationContext = () => useContext(TranslationContext);

export default TranslationContext;
