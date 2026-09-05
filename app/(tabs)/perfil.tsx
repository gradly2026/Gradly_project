// ════════════════════════════════════════════════════════════════════════
// app/(tabs)/perfil.tsx — pestaña "Perfil" del estudiante
//
// GUÍA PARA PRINCIPIANTES:
// La pantalla de perfil del estudiante: foto, nivel, disponibilidad
// horaria, ubicación, información personal editable, habilidades (skills),
// CV, una "tarjeta bancaria" simulada, certificado, reseñas, y cerrar
// sesión. Es el mejor archivo del proyecto para ver TODAS las variantes
// de UPDATE de Firestore en un solo lugar: actualizar un campo de texto,
// un array (skills), un objeto anidado (disponibilidad_horaria), y
// escribir en 2 colecciones a la vez (usuarios + perfiles_estudiantes al
// cambiar la foto). También muestra el patrón "borrador local + guardado
// explícito" (para no escribir en Firestore en cada toque), y un patrón
// de UI "orientado a configuración": en vez de escribir el JSX de cada
// sección del perfil a mano, se arma un array `sections` con la
// definición de cada una, y un componente reutilizable
// (`PerfilMasterDetail`) se encarga de dibujarlas todas de forma
// consistente.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
// DocumentPicker: abre el selector de ARCHIVOS del sistema operativo
// (para elegir un PDF, en este caso), distinto de ImagePicker (que abre
// la galería de FOTOS).
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  // KeyboardAvoidingView: un contenedor especial que EMPUJA su contenido
  // hacia arriba automáticamente cuando el teclado del celular aparece,
  // para que el campo que se está escribiendo no quede tapado.
  Modal,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "../../src/components/AutoText";
import { useAuth } from '../../src/context/AuthContext';
import { auth, db, storage } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { shadow } from '../../src/utils/shadow';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';
import CertificadoGradly from '../../src/components/CertificadoGradly';
// Componente que dibuja el "certificado" visual del estudiante (con su
// XP, calificación y pasantías completadas) — parte del sistema de
// gamificación del proyecto.
import ResenasFeedback from '../../src/components/ResenasFeedback';
// Muestra las reseñas/calificaciones que el estudiante recibió de las
// empresas donde trabajó.
import SalirSesionModal from '../../src/components/SalirSesionModal';
import PerfilMasterDetail from '../../src/components/PerfilMasterDetail';
// EL componente clave de este archivo: recibe la lista `sections`
// (definida más abajo) y se encarga de dibujar toda la estructura visual
// común del perfil (encabezado, lista de secciones expandibles, edición
// inline de campos) — así este archivo de pantalla se concentra en QUÉ
// datos mostrar y CÓMO guardarlos, sin tener que repetir el layout visual
// de cada sección a mano.
import DisponibilidadSelector from '../../src/components/DisponibilidadSelector';
import UbicacionSelector from '../../src/components/UbicacionSelector';
import { resumenDisponibilidadEstudiante } from '../../src/utils/disponibilidadEstudiante';
import {
  contarBloques,
  normalizarDisponibilidad,
  resumenDisponibilidad,
  type DisponibilidadHoraria,
} from '../../src/data/disponibilidad';
import { textoUbicacion, type UbicacionEstudiante } from '../../src/data/ubicacionElSalvador';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface EstudiantePerfil {
  nombre_completo:    string;
  universidad_id:     string;
  carrera:            string;
  semestre:           number;
  horas_objetivo:     number;
  horas_aprobadas:    number;
  horas_en_proceso:   number;
  skills:             string[];
  /** Texto libre heredado ("Tiempo completo"). Se conserva; el dato que el
   *  sistema compara contra horarios es `disponibilidad_horaria`. */
  disponibilidad:     string;
  disponibilidad_horaria?: DisponibilidadHoraria;
  descripcion?:       string;
  departamento?:      string;
  distrito?:          string;
  direccion?:         string;
  cv_url:             string;
  foto_url:           string;
  linkedin:           string;
  portfolio:          string;
  calificacion_promedio: number;
  tarjeta_numero:     string;
  tarjeta_alias:      string;
  // ── Datos personales que el estudiante puede completar (v86) ──
  telefono?:          string;
  facebook?:          string;
  instagram?:         string;
  /** Documento de identidad: tipo + número. Nunca se muestra en ninguna vista
   *  de perfil — solo lo ve el propio estudiante en 'Mi Perfil'. */
  doc_tipo?:          'dui' | 'pasaporte' | 'licencia' | '';
  doc_numero?:        string;
  estado_pasantia?:   string;
  /** Disponibilidad DERIVADA por el sistema (denormalizada para las vistas). */
  disponibilidad_auto?: string;
}

// Devuelve la CLAVE de traducción del nivel; se traduce con t(nivel) al render.
function getLevel(pct: number) {
  // A diferencia de getLevel() en progreso.tsx (que devuelve un objeto
  // con nombre/ícono/color), esta versión SOLO devuelve la CLAVE de
  // traducción — el resto de la información (ícono, color) no hace falta
  // aquí porque el nivel se muestra como simple texto en el subtítulo del
  // perfil.
  if (pct >= 100) return 'nivel_graduado';
  if (pct >= 76)  return 'nivel_experto';
  if (pct >= 51)  return 'nivel_profesional';
  if (pct >= 26)  return 'nivel_practicante';
  return 'nivel_explorador';
}

function formatCardNumber(raw: string) {
  // Formatea lo que el usuario escribe en el campo de número de tarjeta,
  // agrupándolo de a 4 dígitos con espacios ("1234 5678 9012 3456"),
  // como se ve en una tarjeta física real.
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  // Paso a paso:
  //   .replace(/\D/g, '')     → elimina TODO lo que no sea un dígito
  //                              (\D = "no dígito"), por si el usuario
  //                              pegara texto con espacios o guiones.
  //   .slice(0, 16)            → se queda con máximo 16 dígitos (el
  //                              largo estándar de una tarjeta).
  //   .replace(/(.{4})/g, '$1 ') → inserta un espacio después de cada
  //                              grupo de 4 caracteres ("$1" se refiere
  //                              al grupo capturado por (.{4})).
  //   .trim()                   → quita el espacio final sobrante que
  //                              deja el reemplazo anterior.
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────
export default function PerfilTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { styles, colors } = useThemedStyles();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [perfil,        setPerfil]        = useState<EstudiantePerfil | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCV,   setUploadingCV]   = useState(false);

  // Modales
  const [skillInput,      setSkillInput]      = useState('');
  const [showAddSkill,    setShowAddSkill]     = useState(false);
  const [showCardModal,   setShowCardModal]    = useState(false);
  const [showEditModal,   setShowEditModal]    = useState(false);
  const [deletingSkill,   setDeletingSkill]    = useState<string | null>(null);

  // Formulario de tarjeta
  const [cardNumero,     setCardNumero]     = useState('');
  const [cardNombre,     setCardNombre]     = useState('');
  const [cardVence,      setCardVence]      = useState('');
  const [cardAlias,      setCardAlias]      = useState('');

  // Formulario de edición de perfil
  const [editDisp,      setEditDisp]      = useState('');
  const [editLinkedin,  setEditLinkedin]  = useState('');
  const [editPortfolio, setEditPortfolio] = useState('');

  // ── Disponibilidad horaria (borrador local + guardado explícito) ──
  // Se edita en local para no escribir en Firestore en cada casilla tocada.
  const [dispDraft, setDispDraft] = useState<DisponibilidadHoraria>({});
  const [dispDirty, setDispDirty] = useState(false);
  const [dispSaving, setDispSaving] = useState(false);
  // GUÍA DEL PATRÓN "borrador local": si cada vez que el usuario toca una
  // casilla del selector de disponibilidad se escribiera INMEDIATAMENTE
  // en Firestore, se generarían decenas de escrituras innecesarias (una
  // por cada toque, mientras el usuario todavía está decidiendo). En vez
  // de eso: los cambios se guardan primero SOLO en el estado local
  // `dispDraft` (rapidísimo, sin tocar la red), se marca `dispDirty =
  // true` (para mostrar el botón "Guardar"), y solo cuando el usuario
  // confirma, se manda TODO junto a Firestore de una vez
  // (guardarDisponibilidad(), más abajo). El mismo patrón se repite para
  // la ubicación (ubicDraft/ubicDirty/ubicSaving).

  // ── Ubicación (departamento/distrito/dirección) — mismo patrón: borrador
  // local + guardado explícito, para no escribir en cada tap de chip. ──
  const [ubicDraft, setUbicDraft] = useState<Partial<UbicacionEstudiante>>({});
  // "Partial<UbicacionEstudiante>" significa "un objeto con ALGUNAS (o
  // ninguna) de las propiedades de UbicacionEstudiante, todas opcionales"
  // — útil aquí porque, mientras el usuario está llenando el formulario,
  // el borrador puede estar incompleto (por ejemplo, con departamento
  // pero sin distrito todavía).
  const [ubicDirty, setUbicDirty] = useState(false);
  const [ubicSaving, setUbicSaving] = useState(false);

  // ── Información personal (borrador local + guardado explícito, igual patrón). ──
  type InfoDraft = {
    descripcion: string; linkedin: string; telefono: string;
    facebook: string; instagram: string;
    docTipo: 'dui' | 'pasaporte' | 'licencia' | ''; docNumero: string;
  };
  const [infoDraft, setInfoDraft] = useState<InfoDraft>({
    descripcion: '', linkedin: '', telefono: '', facebook: '', instagram: '', docTipo: '', docNumero: '',
  });
  const [infoDirty, setInfoDirty] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);

  // ── Horario del puesto de trabajo activo (para la disponibilidad derivada). ──
  const [contratoHorario, setContratoHorario] = useState<any>(null);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'contratos_laborales'), where('estudianteId', '==', user.uid)),
      snap => {
        const activo = snap.docs.map(d => d.data() as any).find(c => c.estado === 'activo');
        setContratoHorario(activo?.horario ?? null);
      },
      e => console.warn('Error en listener (contrato perfil):', e),
    );
    return unsub;
  }, [user]);

  // ── Firestore: perfil ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_estudiantes', user.uid), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as EstudiantePerfil;
      setPerfil(data);
      // No pisar lo que el usuario está editando ahora mismo.
      setDispDirty(dirty => {
        // Este patrón "setDispDirty(dirty => {...; return dirty;})" es un
        // truco para LEER el valor actual de `dispDirty` dentro de un
        // efecto SIN tener que agregarlo a las dependencias del useEffect
        // (lo cual causaría que el efecto se reinstale cada vez que
        // dispDirty cambiara). Dentro de la función, si `dirty` es false
        // (el usuario NO está editando ahora), se actualiza el borrador
        // con los datos frescos de Firestore; si es true (el usuario SÍ
        // está editando), se IGNORA la actualización de Firestore para no
        // "pisar" lo que el usuario está escribiendo — pero de cualquier
        // forma se devuelve el mismo `dirty` sin cambiarlo (el setter en
        // sí no modifica dispDirty, solo se usa como excusa para leer su
        // valor actual).
        if (!dirty) setDispDraft(normalizarDisponibilidad(data.disponibilidad_horaria));
        return dirty;
      });
      setUbicDirty(dirty => {
        if (!dirty) {
          setUbicDraft({
            departamento: data.departamento,
            // Fallback al campo legado para no vaciar la ubicación de
            // perfiles guardados antes del cambio de nombre municipio→distrito.
            distrito: data.distrito ?? (data as any).municipio,
            direccion: data.direccion,
          });
        }
        return dirty;
      });
      setInfoDirty(dirty => {
        if (!dirty) {
          setInfoDraft({
            descripcion: data.descripcion ?? '',
            linkedin: data.linkedin ?? '',
            telefono: data.telefono ?? '',
            facebook: data.facebook ?? '',
            instagram: data.instagram ?? '',
            docTipo: (data.doc_tipo ?? '') as InfoDraft['docTipo'],
            docNumero: data.doc_numero ?? '',
          });
        }
        return dirty;
      });
    });
    return unsub;
  }, [user]);

  const guardarDisponibilidad = async () => {
    // Se ejecuta al tocar el botón "Guardar" que aparece cuando
    // dispDirty es true.
    if (!user) return;
    setDispSaving(true);
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user.uid), {
        disponibilidad_horaria: dispDraft,
        // UPDATE: guarda el objeto COMPLETO de disponibilidad de una sola
        // vez (no campo por campo), reemplazando lo que hubiera antes.
      });
      setDispDirty(false);
      // Ya se guardó: se apaga la bandera "hay cambios sin guardar".
    } catch {
      Alert.alert(t('error_generico'), t('err_guardar'));
    } finally {
      setDispSaving(false);
    }
  };

  const guardarUbicacion = async () => {
    if (!user || !ubicDraft.departamento || !ubicDraft.distrito) return;
    // No permite guardar si faltan los 2 campos obligatorios (dirección
    // específica sí es opcional).
    setUbicSaving(true);
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user.uid), {
        departamento: ubicDraft.departamento,
        distrito: ubicDraft.distrito,
        direccion: ubicDraft.direccion?.trim() || '',
      });
      setUbicDirty(false);
    } catch {
      Alert.alert(t('error_generico'), t('err_guardar'));
    } finally {
      setUbicSaving(false);
    }
  };

  const guardarInfo = async () => {
    if (!user) return;
    setInfoSaving(true);
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user.uid), {
        descripcion: infoDraft.descripcion.trim(),
        linkedin: infoDraft.linkedin.trim(),
        telefono: infoDraft.telefono.trim(),
        facebook: infoDraft.facebook.trim(),
        instagram: infoDraft.instagram.trim().replace(/^@/, ''),
        doc_tipo: infoDraft.docTipo,
        doc_numero: infoDraft.docNumero.trim(),
      });
      setInfoDirty(false);
    } catch {
      Alert.alert(t('error_generico'), t('err_guardar'));
    } finally {
      setInfoSaving(false);
    }
  };

  // ── Estadísticas ─────────────────────────────────────────────────
  const horasAprobadas = perfil?.horas_aprobadas ?? 0;
  const horasObjetivo  = perfil?.horas_objetivo  ?? 500;
  const pct = Math.round((horasAprobadas / horasObjetivo) * 100);
  const nivel = getLevel(Math.min(pct, 100));
  // ¿Ya culminó su (única) pasantía? `estado_pasantia === 'finalizada'` lo pone
  // `finalizarInscripcionPorHoras` al cumplir la meta de horas del cupo; `pct
  // >= 100` cubre a quien ya certificó. Con esto la Certificación Gradly pasa a
  // "Experto" con la barra llena; en proceso / sin iniciar sigue en "Novato".
  const pasantiaCulminada =
    (perfil as any)?.estado_pasantia === 'finalizada' || pct >= 100;

  // ── Disponibilidad DERIVADA (el estudiante ya no la escribe). Se calcula de
  //    su estado de pasantía + el horario de su puesto de trabajo activo y se
  //    denormaliza en `disponibilidad_auto` para que las vistas de perfil la
  //    lean sin consultar otras colecciones. ──
  const dispResumen = useMemo(
    () => resumenDisponibilidadEstudiante({
      estadoPasantia: perfil?.estado_pasantia,
      culminada: pasantiaCulminada,
      horarioPuesto: contratoHorario,
    }),
    [perfil?.estado_pasantia, pasantiaCulminada, contratoHorario],
  );
  useEffect(() => {
    if (!user || !perfil) return;
    if (perfil.disponibilidad_auto === dispResumen.texto) return;
    updateDoc(doc(db, 'perfiles_estudiantes', user.uid), {
      disponibilidad_auto: dispResumen.texto,
    }).catch(() => {});
  }, [user, perfil, dispResumen.texto]);

  // ── Subir / cambiar foto de perfil ────────────────────────────────
  const handleUploadFoto = async () => {
    // a. Permisos de galería
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    // Le pide AL SISTEMA OPERATIVO permiso para acceder a las fotos del
    // usuario — obligatorio en Android/iOS antes de poder abrir la
    // galería (parte del sistema de permisos de privacidad del propio
    // dispositivo, no algo específico de Firebase).
    if (status !== 'granted') {
      Alert.alert(t('perfil_permiso_titulo'), t('perfil_permiso_msg'));
      return;
    }

    // b. Abrir galería (solo imágenes, edición, aspecto 1:1)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      // aspect: [1, 1] fuerza que el recorte de edición sea CUADRADO
      // (proporción 1:1) — apropiado para una foto de perfil circular.
      quality: 0.8,
      // quality: 0.8 comprime la imagen un poco (80% de calidad) para
      // que el archivo pese menos al subirlo, sin perder demasiada
      // nitidez visual.
    });
    if (result.canceled) return;
    // Si el usuario cerró el selector sin elegir nada, no hay nada más
    // que hacer.

    setUploadingFoto(true);
    try {
      // c. URI → Blob
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      // Mismo patrón "fetch + .blob()" visto en services/authService.ts
      // para convertir el archivo local elegido en datos binarios subibles.

      // d. Subir a Storage en fotos_estudiantes/{uid}/perfil.jpg
      const storageRef = ref(storage, `fotos_estudiantes/${user!.uid}/perfil.jpg`);
      await uploadBytes(storageRef, blob);

      // e. URL de descarga + cache-busting.
      //    getDownloadURL ya devuelve "...?alt=media&token=...", por lo que el
      //    cache-buster debe ir con "&" (no con "?", o la URL quedaría inválida
      //    con dos signos de interrogación y la imagen nunca cargaría).
      const baseUrl = await getDownloadURL(storageRef);
      const urlActualizada = `${baseUrl}&t=${new Date().getTime()}`;
      // GUÍA DEL "CACHE-BUSTING": como el nombre del archivo en Storage
      // SIEMPRE es el mismo ("perfil.jpg"), si el usuario cambia su foto,
      // la URL de descarga sería IDÉNTICA a la anterior — y el navegador/
      // celular podría seguir mostrando la imagen VIEJA que tenía
      // guardada en su caché local, pensando "ya tengo esta URL, no hace
      // falta descargarla de nuevo". Agregar "&t=1234567890" (la hora
      // actual en milisegundos) al final de la URL hace que, aunque la
      // imagen sea la misma, el TEXTO de la URL sea distinto cada vez —
      // engañando al caché para que SIEMPRE vuelva a descargar la imagen
      // fresca.

      // f. Actualizar Firestore en ambas colecciones simultáneamente
      await Promise.all([
        updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { foto_url: urlActualizada }),
        updateDoc(doc(db, 'usuarios', user!.uid), { foto_url: urlActualizada }),
      ]);
      // UPDATE doble en paralelo: el campo `foto_url` está DUPLICADO
      // (desnormalizado) en 2 colecciones distintas —
      // "perfiles_estudiantes" (el perfil completo) y "usuarios" (los
      // datos comunes a cualquier rol, que otras pantallas leen para
      // mostrar avatares pequeños sin tener que ir a buscar el perfil
      // completo) — así que hay que actualizar AMBAS para que la nueva
      // foto se vea en todos lados.

      // g. Inyectar la nueva URL directamente en el estado del perfil para que
      //    la imagen se refleje de inmediato dentro del contenedor circular.
      setPerfil(prev => (prev ? { ...prev, foto_url: urlActualizada } : prev));
      // Actualiza el estado LOCAL de inmediato (sin esperar a que
      // onSnapshot detecte el cambio en Firestore, lo cual tardaría un
      // poquito más) — la pantalla se siente instantánea. Cuando
      // onSnapshot sí reciba la confirmación del servidor, sobrescribirá
      // este mismo valor con el dato ya confirmado (sin cambio visible
      // para el usuario, porque ya coinciden).
    } catch (e) {
      // h. Manejo de errores
      console.warn('Error al subir la foto de perfil:', e);
      Alert.alert(t('error_generico'), t('err_subir_foto'));
    } finally {
      setUploadingFoto(false);
    }
  };

  // ── Subir CV ──────────────────────────────────────────────────────
  const handleUploadCV = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    // type: 'application/pdf' restringe el selector de archivos para que
    // solo se puedan elegir archivos PDF.
    if (result.canceled) return;

    const file = result.assets[0];
    setUploadingCV(true);
    try {
      const resp = await fetch(file.uri);
      const blob = await resp.blob();
      const storageRef = ref(storage, `cvs/${user!.uid}/${file.name}`);
      // A diferencia de la foto (nombre fijo "perfil.jpg"), aquí se
      // conserva el NOMBRE ORIGINAL del archivo (file.name) — mismo
      // patrón visto en uploadCV() de services/authService.ts.
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { cv_url: url });
      Alert.alert(t('perfil_cv_subido'), t('perfil_cv_subido_msg'));
    } catch {
      Alert.alert(t('error_generico'), t('err_subir_cv'));
    } finally {
      setUploadingCV(false);
    }
  };

  // ── Agregar skill ─────────────────────────────────────────────────
  const handleAddSkill = async () => {
    const sk = skillInput.trim();
    if (!sk) return;
    const current = perfil?.skills ?? [];
    if (current.includes(sk)) { setSkillInput(''); return; }
    // No agrega duplicados: si la habilidad ya está en la lista, solo
    // limpia el campo de texto sin volver a escribir en Firestore.
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        skills: [...current, sk],
        // UPDATE de un ARRAY: se construye la lista NUEVA completa
        // (todas las skills anteriores + la nueva al final, usando
        // spread) y se reemplaza el campo entero. Es distinto a
        // arrayUnion() (visto en pasantiaService.ts) — aquí se hace
        // "a mano" porque de todas formas ya se necesitaba leer y
        // comparar `current` para evitar duplicados; arrayUnion también
        // habría funcionado, pero este enfoque da el mismo resultado.
      });
    } catch { Alert.alert(t('error_generico'), t('err_agregar_skill')); }
    setSkillInput('');
    setShowAddSkill(false);
  };

  // ── Eliminar skill ────────────────────────────────────────────────
  const handleDeleteSkill = async (sk: string) => {
    const current = (perfil?.skills ?? []).filter(s => s !== sk);
    // .filter() con "s !== sk" construye una lista nueva SIN la skill que
    // se quiere borrar (se queda con todas las que NO coincidan).
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { skills: current });
    } catch { Alert.alert(t('error_generico'), t('err_eliminar_skill')); }
    setDeletingSkill(null);
  };

  // ── Guardar tarjeta ───────────────────────────────────────────────
  const handleGuardarTarjeta = async () => {
    const digits = cardNumero.replace(/\s/g, '');
    // Quita los espacios que formatCardNumber() había insertado, para
    // volver a tener solo los dígitos puros.
    if (digits.length !== 16) { Alert.alert(t('perfil_num_invalido'), t('perfil_num_invalido_msg')); return; }
    if (!cardAlias.trim()) { Alert.alert(t('perfil_alias_req'), t('perfil_alias_req_msg')); return; }
    try {
      // SOLO guardamos los últimos 4 dígitos. NUNCA el número completo.
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        tarjeta_numero: digits.slice(-4),
        // .slice(-4) toma los ÚLTIMOS 4 caracteres del texto — una nota
        // de seguridad importante marcada en el propio comentario
        // original: NUNCA se guarda el número completo de la tarjeta en
        // Firestore (esta es una "tarjeta simulada" de demostración del
        // proyecto, no un sistema de pagos real, pero igual sigue esta
        // buena práctica de no persistir datos sensibles completos).
        tarjeta_alias:  cardAlias.trim(),
      });
      Alert.alert(t('perfil_tarjeta_guardada'), t('perfil_tarjeta_guardada_msg'));
      setShowCardModal(false);
      setCardNumero(''); setCardNombre(''); setCardVence(''); setCardAlias('');
      // Limpia todo el formulario tras guardar exitosamente.
    } catch { Alert.alert(t('error_generico'), t('err_guardar_tarjeta')); }
  };

  // ── Guardar perfil ────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    // Nota: esta función queda definida pero, revisando el JSX más abajo,
    // el modal "showEditModal" que la usaría no aparece — es código que
    // pudo haber quedado de una versión anterior de la pantalla (la
    // edición de disponibilidad/linkedin/portfolio ahora se hace desde la
    // sección 'info' del array `sections`, con su propio `onSave`). No
    // afecta el funcionamiento actual, simplemente no se llama desde
    // ningún botón visible.
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        disponibilidad: editDisp,
        linkedin:       editLinkedin,
        portfolio:      editPortfolio,
      });
      setShowEditModal(false);
    } catch { Alert.alert(t('error_generico'), t('err_guardar')); }
  };

  const handleAyuda = () => {
    router.push('/help-gradly' as any);
  };
  const handleAcerca = () => {
    router.push('/about-gradly' as any);
  };

  const confirmarCierreSesion = async () => {
    try {
      setLogoutModalVisible(false);
      await signOut(auth);
      router.replace('/auth/iniciosesion' as any);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (!perfil && !user) return null;
  // Mientras no haya NI perfil NI usuario (estado inicial antes de que
  // termine de cargar), no dibuja nada.

  const skills  = perfil?.skills ?? [];
  const tieneCV = !!(perfil?.cv_url);

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      <PerfilMasterDetail
        // Aquí es donde se activa el patrón "orientado a configuración"
        // mencionado en la guía del encabezado: en vez de escribir el
        // JSX completo de cada sección del perfil (con su tarjeta, su
        // ícono, su título, su contenido) directamente en ESTE archivo,
        // se le pasa a <PerfilMasterDetail> toda la información como
        // DATOS (props), y ese componente reutilizable se encarga de
        // dibujar la estructura visual repetida (acordeón, tarjetas,
        // edición inline) de forma consistente para las 7 secciones.
        name={perfil?.nombre_completo ?? user?.email ?? 'Estudiante'}
        subtitle={`${perfil?.carrera ?? t('perfil_sin_carrera')} · ${t(nivel)}`}
        avatarUrl={perfil?.foto_url}
        avatarStoragePath={user ? `fotos_estudiantes/${user.uid}/perfil.jpg` : null}
        fallbackIcon="person"
        onEditPhoto={handleUploadFoto}
        uploadingPhoto={uploadingFoto}
        onAyuda={handleAyuda}
        onAcerca={handleAcerca}
        onLogout={() => setLogoutModalVisible(true)}
        labels={{
          // Como PerfilMasterDetail es un componente reutilizado también
          // por empresa/universidad (con textos distintos), este
          // archivo le pasa TODOS los textos ya traducidos (con t())
          // como props — así el componente compartido no necesita saber
          // nada de idiomas, solo dibuja el texto que se le da.
          editar: t('perfil_editar'),
          guardar: t('accion_guardar'),
          cancelar: t('accion_cancelar'),
          preferencias: t('perfil_preferencias'),
          preferenciasSub: t('perfil_preferencias_sub'),
          tema: t('perfil_tema'),
          temaClaro: t('perfil_tema_claro'),
          temaOscuro: t('perfil_tema_oscuro'),
          idioma: t('perfil_idioma'),
          ayuda: t('perfil_ayuda'),
          acerca: t('acerca_titulo'),
          cerrarSesion: t('cerrar_sesion'),
          cuenta: t('perfil_cuenta'),
        }}
        sections={[
          // Cada objeto de este array describe UNA sección expandible
          // del perfil. Los campos comunes son: id (identificador único),
          // title/subtitle (lo que se ve siempre visible), icon, tone
          // (color temático de la sección), y luego CUALQUIERA de estas 2
          // formas de definir su contenido:
          //   - render: () => JSX  → contenido totalmente personalizado
          //     (usado cuando la sección necesita algo especial, como el
          //     selector de disponibilidad o la tarjeta bancaria).
          //   - fields: [...] + onSave → una lista de CAMPOS DE TEXTO
          //     genéricos, que PerfilMasterDetail sabe dibujar y editar
          //     por sí solo, sin necesitar JSX personalizado (usado en la
          //     sección 'info').
          {
            id: 'cert',
            title: t('perfil_stat_nivel'),
            subtitle: `${horasAprobadas}h · ${Math.min(pct, 100)}%`,
            icon: 'ribbon-outline',
            tone: 'orange',
            render: () => (
              <CertificadoGradly
                xp={Number((perfil as any)?.puntos_experiencia ?? 0)}
                calificacion={Number(perfil?.calificacion_promedio ?? 0)}
                nombre={perfil?.nombre_completo}
                theme={isDark ? 'dark' : 'light'}
                pasantiaCulminada={pasantiaCulminada}
              />
            ),
          },
          {
            id: 'resenas',
            title: t('resenas_titulo'),
            subtitle: t('resenas_subtitulo'),
            icon: 'chatbox-ellipses-outline',
            tone: 'purple',
            render: () => (
              <ResenasFeedback
                entidadId={user?.uid ?? ''}
                entidadRol="estudiante"
                theme={isDark ? 'dark' : 'light'}
              />
            ),
          },
          /* ── "Mi disponibilidad" OCULTA a pedido del usuario (2026-09-02).
             El estudiante ya no fija sus horarios aquí; el horario de la
             práctica lo define la empresa/universidad al inscribirlo. Para
             volver a mostrarla, descomentar este bloque (y quitar el aviso
             de más abajo si se agregó).
          {
            id: 'disponibilidad',
            title: t('disp_titulo'),
            subtitle: resumenDisponibilidad(dispDraft) ?? t('disp_sin_definir'),
            icon: 'time-outline',
            tone: contarBloques(dispDraft) > 0 ? 'green' : 'orange',
            render: () => (
              <View style={{ gap: 12 }}>
                <DisponibilidadSelector
                  value={dispDraft}
                  onChange={next => { setDispDraft(next); setDispDirty(true); }}
                />
                {dispDirty && (
                  <TouchableOpacity
                    style={styles.dispSaveBtn}
                    onPress={guardarDisponibilidad}
                    disabled={dispSaving}
                  >
                    {dispSaving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="checkmark" size={16} color="#FFF" />}
                    <Text style={styles.dispSaveTxt}>{t('disp_guardar')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ),
          },
          ── */
          {
            id: 'ubicacion',
            title: t('ubicacion_titulo'),
            subtitle: textoUbicacion(ubicDraft) || t('ubicacion_sin_definir'),
            icon: 'location-outline',
            tone: ubicDraft.departamento && ubicDraft.distrito ? 'green' : 'orange',
            render: () => (
              <View style={{ gap: 12 }}>
                <UbicacionSelector
                  value={ubicDraft}
                  onChange={next => { setUbicDraft(next); setUbicDirty(true); }}
                />
                {ubicDirty && (
                  <TouchableOpacity
                    style={[styles.dispSaveBtn, (!ubicDraft.departamento || !ubicDraft.distrito) && { opacity: 0.45 }]}
                    onPress={guardarUbicacion}
                    disabled={ubicSaving || !ubicDraft.departamento || !ubicDraft.distrito}
                  >
                    {ubicSaving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="checkmark" size={16} color="#FFF" />}
                    <Text style={styles.dispSaveTxt}>{t('ubicacion_guardar')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ),
          },
          {
            // Formulario propio (no el patrón `fields` genérico) para tener el
            // selector de tipo de documento y los datos de solo lectura.
            // 'disponibilidad' y 'portfolio' se quitaron a pedido del usuario:
            // la disponibilidad ahora la deriva el sistema (ver dispResumen).
            id: 'info',
            title: t('perfil_info_personal'),
            subtitle: perfil?.nombre_completo || t('perfil_no_especificado'),
            icon: 'person-outline',
            tone: 'blue',
            render: () => (
              <View style={{ gap: 10 }}>
                {/* Solo lectura: nombre (del registro) y correo (del login) */}
                <View style={styles.infoRO}>
                  <Text style={styles.fieldLabel}>{t('campo_nombre')}</Text>
                  <Text style={styles.infoROValue} noTranslate>{perfil?.nombre_completo || '—'}</Text>
                  <Text style={[styles.fieldLabel, { marginTop: 8 }]}>{t('campo_email')}</Text>
                  <Text style={styles.infoROValue} noTranslate>{user?.email || '—'}</Text>
                </View>

                {/* Documento de identidad — NO se muestra en ninguna vista de
                    perfil, solo aquí. */}
                <Text style={styles.fieldLabel}>{t('perfil_doc_identidad')}</Text>
                <View style={styles.docChips}>
                  {([['dui', t('perfil_doc_dui')], ['pasaporte', t('perfil_doc_pasaporte')], ['licencia', t('perfil_doc_licencia')]] as const).map(([k, lbl]) => {
                    const activo = infoDraft.docTipo === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[styles.docChip, activo && styles.docChipOn]}
                        onPress={() => { setInfoDraft(d => ({ ...d, docTipo: activo ? '' : k })); setInfoDirty(true); }}
                      >
                        <Text style={[styles.docChipTxt, activo && styles.docChipTxtOn]}>{lbl}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.modalInput}
                  value={infoDraft.docNumero}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, docNumero: v })); setInfoDirty(true); }}
                  placeholder={t('perfil_doc_numero_ph')}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                />

                <Text style={styles.fieldLabel}>{t('campo_telefono')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={infoDraft.telefono}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, telefono: v })); setInfoDirty(true); }}
                  placeholder="2222 3333"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                />

                <Text style={styles.fieldLabel}>Facebook</Text>
                <TextInput
                  style={styles.modalInput}
                  value={infoDraft.facebook}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, facebook: v })); setInfoDirty(true); }}
                  placeholder="facebook.com/tu-perfil"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />

                <Text style={styles.fieldLabel}>Instagram</Text>
                <TextInput
                  style={styles.modalInput}
                  value={infoDraft.instagram}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, instagram: v })); setInfoDirty(true); }}
                  placeholder="@tu.usuario"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />

                <Text style={styles.fieldLabel}>{t('campo_linkedin')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={infoDraft.linkedin}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, linkedin: v })); setInfoDirty(true); }}
                  placeholder="https://linkedin.com/in/tu-perfil"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Text style={styles.fieldLabel}>{t('campo_descripcion')}</Text>
                <TextInput
                  style={[styles.modalInput, { height: 88, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={infoDraft.descripcion}
                  onChangeText={v => { setInfoDraft(d => ({ ...d, descripcion: v })); setInfoDirty(true); }}
                  placeholder={t('perfil_descripcion_placeholder')}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />

                {infoDirty && (
                  <TouchableOpacity style={styles.dispSaveBtn} onPress={guardarInfo} disabled={infoSaving}>
                    {infoSaving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="checkmark" size={16} color="#FFF" />}
                    <Text style={styles.dispSaveTxt}>{t('accion_guardar')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ),
          },
          {
            id: 'skills',
            title: t('campo_habilidades'),
            subtitle: `${skills.length}`,
            icon: 'sparkles-outline',
            tone: 'purple',
            render: () => (
              <View style={styles.skillsWrap}>
                {skills.map(sk => (
                  <TouchableOpacity
                    key={sk}
                    style={styles.skillChip}
                    onLongPress={() => setDeletingSkill(sk)}
                    onPress={() => setDeletingSkill(sk)}
                    // Tanto un toque normal como uno "largo" (mantener
                    // presionado) abren la confirmación de borrado —
                    // redundante a propósito, para que funcione fácil
                    // tanto en celular (donde "mantener presionado" es un
                    // gesto natural) como en web (donde no siempre existe
                    // ese gesto, y un clic simple es más intuitivo).
                  >
                    <Text style={styles.skillText}>{sk}</Text>
                  </TouchableOpacity>
                ))}
                {!showAddSkill ? (
                  <TouchableOpacity style={styles.addSkillBtn} onPress={() => setShowAddSkill(true)}>
                    <Ionicons name="add" size={16} color={COLORS.primaryLight} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.skillInputWrap}>
                    <TextInput
                      style={styles.skillInput}
                      value={skillInput}
                      onChangeText={setSkillInput}
                      placeholder={t('perfil_nueva_skill')}
                      placeholderTextColor={COLORS.textMuted}
                      autoFocus
                      // autoFocus: el teclado se abre automáticamente
                      // apenas aparece este campo, sin que el usuario
                      // tenga que tocarlo primero.
                      returnKeyType="done"
                      onSubmitEditing={handleAddSkill}
                      selectionColor={COLORS.primary}
                    />
                    <TouchableOpacity onPress={handleAddSkill} style={{ padding: 4 }}>
                      <Ionicons name="checkmark" size={18} color={COLORS.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowAddSkill(false); setSkillInput(''); }} style={{ padding: 4 }}>
                      <Ionicons name="close" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ),
          },
          {
            id: 'cv',
            title: 'CV',
            subtitle: tieneCV ? 'PDF subido' : t('perfil_no_especificado'),
            icon: 'document-text-outline',
            tone: 'green',
            render: () => (
              <JellyButton
                style={[styles.actionBtn, tieneCV && styles.actionBtnSecondary]}
                contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0, paddingHorizontal: 18 }}
                onPress={handleUploadCV}
                disabled={uploadingCV}
              >
                {uploadingCV
                  ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
                  : <Ionicons name="document-outline" size={18} color={tieneCV ? COLORS.success : COLORS.textPrimary} />
                }
                <Text style={[styles.actionBtnText, tieneCV && { color: COLORS.success }]}>
                  {tieneCV ? 'CV subido — Reemplazar' : 'Subir CV (PDF)'}
                </Text>
                {tieneCV && <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />}
              </JellyButton>
            ),
          },
          {
            id: 'tarjeta',
            title: t('perfil_tarjeta_titulo'),
            subtitle: perfil?.tarjeta_numero ? `•••• ${perfil.tarjeta_numero}` : t('perfil_sin_tarjeta'),
            icon: 'card-outline',
            tone: 'blue',
            render: () => (
              <>
                <GlassCard style={{ borderColor: COLORS.primary35 }} contentStyle={{ padding: 20, gap: 12 }}>
                  <View style={styles.bankCardTop}>
                    <Text style={styles.bankCardBrand}>GRADLY PAY</Text>
                    <Ionicons name="card-outline" size={24} color={COLORS.primaryLight} />
                  </View>
                  <Text style={styles.bankCardNumber}>
                    •••• •••• •••• {perfil?.tarjeta_numero || '????'}
                  </Text>
                  <Text style={styles.bankCardAlias}>{perfil?.tarjeta_alias || t('perfil_sin_tarjeta')}</Text>
                </GlassCard>
                <TouchableOpacity style={[styles.actionBtnOutline, { marginTop: 12 }]} onPress={() => setShowCardModal(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primaryLight} />
                  <Text style={styles.actionBtnOutlineText}>
                    {perfil?.tarjeta_numero ? t('perfil_cambiar_tarjeta') : t('perfil_agregar_tarjeta')}
                  </Text>
                </TouchableOpacity>
              </>
            ),
          },
        ]}
      />

      {/* ── MODAL: Confirmar eliminar skill ── */}
      <Modal visible={!!deletingSkill} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('perfil_eliminar_skill')}</Text>
            <Text style={styles.modalDesc}>{t('perfil_quitar_skill', { skill: deletingSkill ?? '' })}</Text>
            {/* t('perfil_quitar_skill', { skill: ... }) — traducción CON
                parámetro: la frase en el JSON tendrá algo como "¿Quitar
                {{skill}} de tu perfil?" y aquí se rellena el nombre real
                de la skill (ver la explicación de interpolación en
                TranslationContext.tsx). */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDeletingSkill(null)}>
                <Text style={styles.modalCancelText}>{t('accion_cancelar')}</Text>
              </TouchableOpacity>
              <JellyButton
                style={styles.modalDelete}
                contentStyle={{ paddingVertical: 0 }}
                onPress={() => deletingSkill && handleDeleteSkill(deletingSkill)}
              >
                <Text style={styles.modalDeleteText}>{t('accion_eliminar')}</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Tarjeta bancaria ── */}
      <Modal visible={showCardModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* behavior distinto por plataforma: iOS y Android manejan el
              ajuste del teclado de forma distinta a bajo nivel — 'padding'
              funciona mejor en iOS, 'height' en Android. */}
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>{t('perfil_datos_tarjeta')}</Text>
            <Text style={styles.modalDesc}>{t('perfil_tarjeta_desc')}</Text>

            <Text style={styles.fieldLabel}>{t('perfil_num_tarjeta')}</Text>
            <TextInput
              style={styles.modalInput}
              value={cardNumero}
              onChangeText={t => setCardNumero(formatCardNumber(t))}
              // Cada tecla que se escribe pasa por formatCardNumber()
              // ANTES de guardarse en el estado — así el formato con
              // espacios se aplica EN VIVO mientras el usuario escribe.
              placeholder="1234 5678 9012 3456"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={19}
              // 16 dígitos + 3 espacios entre grupos = 19 caracteres máximo.
              selectionColor={COLORS.primary}
            />

            <Text style={styles.fieldLabel}>{t('perfil_titular')}</Text>
            <TextInput
              style={styles.modalInput}
              value={cardNombre}
              onChangeText={setCardNombre}
              placeholder="JUAN PÉREZ"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              selectionColor={COLORS.primary}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('perfil_vencimiento')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={cardVence}
                  onChangeText={setCardVence}
                  placeholder="MM/YY"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                  selectionColor={COLORS.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('perfil_alias')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={cardAlias}
                  onChangeText={setCardAlias}
                  placeholder={t('perfil_mi_tarjeta')}
                  placeholderTextColor={COLORS.textMuted}
                  selectionColor={COLORS.primary}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCardModal(false)}>
                <Text style={styles.modalCancelText}>{t('accion_cancelar')}</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={handleGuardarTarjeta}>
                <Text style={styles.modalSaveText}>{t('accion_guardar')}</Text>
              </JellyButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: Confirmar cierre de sesión ── */}
      <SalirSesionModal
        visible={logoutModalVisible}
        onConfirm={confirmarCierreSesion}
        onCancel={() => setLogoutModalVisible(false)}
      />
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────
function StatHero({ label, value }: { label: string; value: number | string }) {
  // Nota: definido pero NO usado en el JSX actual de este archivo (el
  // encabezado con estadísticas ahora lo dibuja PerfilMasterDetail
  // internamente) — código que quedó de una versión anterior de esta
  // pantalla, sin que rompa nada por seguir aquí.
  const { styles } = useThemedStyles();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statHeroValue}>{value}</Text>
      <Text style={styles.statHeroLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean;
}) {
  // Tampoco usado directamente en el JSX visible (reemplazado por el
  // sistema `fields` de PerfilMasterDetail) — mismo caso que StatHero.
  const { styles, colors } = useThemedStyles();
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },

  // ── Hero
  heroCard: {
    backgroundColor: COLORS.backgroundCard,
    paddingTop: 56, paddingBottom: 24,
    alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  fotoWrap: { position: 'relative', marginBottom: 4 },
  foto: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: COLORS.primary,
  },
  fotoFallback: {
    backgroundColor: COLORS.backgroundSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  camaraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.backgroundCard,
  },
  nombre: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  universidad: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  nivelBadge: {
    backgroundColor: COLORS.primary20,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  nivelText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8, width: '100%', paddingHorizontal: 24,
  },
  statHeroValue: { fontSize: 22, fontFamily: FONTS.rajdhaniBold, color: COLORS.textPrimary },
  statHeroLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  statSep: { width: 1, height: 32, backgroundColor: COLORS.border },
  // (Todo este bloque "Hero" de estilos ya no se usa directamente en el
  // JSX — PerfilMasterDetail dibuja su propio encabezado con sus propios
  // estilos internos — pero se deja definido en el archivo sin causar
  // ningún problema.)

  // ── Secciones
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  sectionTitle: {
    fontSize: 14, fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight, letterSpacing: 0.3,
    textTransform: 'uppercase', marginBottom: 2,
  },

  // ── Botones de acción
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 14, height: 50, paddingHorizontal: 18,
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 6 }),
  },
  actionBtnSecondary: { backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.success + '44' },
  actionBtnText: { flex: 1, fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  actionBtnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white4, borderRadius: 14, height: 48, paddingHorizontal: 18,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionBtnOutlineText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },

  // ── Skills
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    backgroundColor: COLORS.primary12, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  skillText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },
  dispSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16,
  },
  dispSaveTxt: { color: '#FFF', fontSize: 13.5, fontFamily: FONTS.interSemiBold },

  // ── Información personal
  infoRO: {
    backgroundColor: COLORS.backgroundSurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 4,
  },
  infoROValue: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary, marginTop: 2 },
  docChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docChip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  docChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary12 },
  docChipTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
  docChipTxtOn: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },

  addSkillBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  skillInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
    flex: 1,
  },
  skillInput: {
    flex: 1, fontSize: 12,
    fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    paddingVertical: 0,
  },

  // ── Info personal
  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  infoLabel: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  infoValue: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },

  // ── Tarjeta bancaria
  bankCard: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20, gap: 12,
    borderWidth: 1, borderColor: COLORS.primary35,
    ...shadow({ color: COLORS.primary, y: 4, blur: 12, opacity: 0.2, elevation: 0 }),
  },
  bankCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankCardBrand: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, letterSpacing: 2 },
  bankCardNumber: { fontSize: 22, fontFamily: FONTS.rajdhaniBold, color: COLORS.textPrimary, letterSpacing: 4 },
  bankCardAlias: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // ── Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 14, height: 50, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  logoutText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },

  // ── Modales
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24, width: '100%',
    borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  sheetCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24, width: '100%',
    borderWidth: 1, borderColor: COLORS.border, gap: 8,
    position: 'absolute', bottom: 0, left: 0, right: 0,
    // position: 'absolute' + bottom/left/right: 0 hace que esta tarjeta
    // se pegue al FONDO de la pantalla, como una "hoja" que sube desde
    // abajo (bottom sheet) — distinto al modalCard de arriba, que queda
    // centrado en la pantalla.
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  modalDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight, marginTop: 6, letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    height: 46, paddingHorizontal: 14,
    fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  modalDelete: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDeleteText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },
  modalSave: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
});
