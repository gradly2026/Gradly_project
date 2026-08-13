/**
 * VacanteDetailByIdModal — abre `VacanteDetailModal` a partir de solo un id.
 *
 * Pensado para deep links (p. ej. tocar una notificación "Vacante publicada"):
 * el llamador no tiene el documento a mano, solo el id guardado en la
 * notificación, así que este wrapper lo busca y muestra un loader mientras
 * tanto.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Este archivo es PEQUEÑO (68 líneas) a propósito — es el mejor lugar del
// proyecto para ver, de principio a fin y sin distracciones, el patrón
// completo "leer UN documento de Firestore (READ) y mostrarlo en
// pantalla" — con sus 3 estados típicos: cargando, error/no-encontrado, y
// éxito.
//
// Este componente NO dibuja el modal bonito con toda la información (eso
// lo hace VacanteDetailModal, otro archivo) — su único trabajo es: dado
// un ID de vacante suelto, ir a buscarla en Firestore y, cuando ya la
// tenga, pasársela a VacanteDetailModal para que la muestre. Por eso su
// nombre termina en "ByIdModal" ("por id").
// ════════════════════════════════════════════════════════════════════════

import { doc, getDoc } from 'firebase/firestore';
// doc() apunta a un documento específico; getDoc() lo LEE una sola vez
// (ver la explicación completa en pasantiaService.ts si hace falta
// repasar). Aquí es literalmente la única operación de Firestore de todo
// el archivo.

import { useEffect, useState } from 'react';
// Hooks de React ya conocidos.

import { ActivityIndicator, Modal, View } from 'react-native';
// ActivityIndicator: el "círculo girando" estándar que indica "cargando".
// Modal y View: contenedores ya vistos en FloatingTopBar.tsx.

import { db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import VacanteDetailModal, { type VacanteDetalle } from './VacanteDetailModal';
// Importa el componente "hermano" que sabe dibujar el detalle completo de
// una vacante (VacanteDetailModal), y también su TIPO `VacanteDetalle`
// (la forma que debe tener el objeto vacante) — un mismo import puede
// traer tanto un valor (el componente) como un tipo, separados por coma,
// marcando el tipo con la palabra `type` para que quede claro que ESE en
// particular es solo información para TypeScript.

interface Props {
  // Las 3 props que este componente necesita para funcionar.
  visible: boolean;          // ¿debe mostrarse el modal ahora mismo?
  vacanteId: string | null;  // el ID de la vacante a buscar (o null si no hay ninguna)
  onClose: () => void;       // función a llamar cuando el usuario cierra el modal
}

export default function VacanteDetailByIdModal({ visible, vacanteId, onClose }: Props) {
  const { colors } = useTheme();
  const [vacante, setVacante] = useState<VacanteDetalle | null>(null);
  // Estado: la vacante ya cargada desde Firestore (o null mientras no se
  // ha cargado nada, o si no se encontró).
  const [loading, setLoading] = useState(false);
  // Estado: ¿está en curso la búsqueda ahora mismo?

  useEffect(() => {
    // Este efecto vuelve a correr cada vez que cambia `visible` o
    // `vacanteId` (dependencias al final: [visible, vacanteId]) — es
    // decir, cada vez que se abre el modal con un ID nuevo.
    if (!visible || !vacanteId) {
      setVacante(null);
      return;
      // Si el modal no debe mostrarse, o no hay ningún ID (por ejemplo,
      // se acaba de cerrar), limpia el estado y no hace ninguna consulta.
    }
    let cancel = false;
    // Bandera de seguridad, mismo patrón visto en TranslationContext.tsx:
    // si el componente se desmonta (o vuelve a correr este efecto con un
    // ID distinto) ANTES de que la consulta termine, `cancel` se pone en
    // true para evitar actualizar el estado con una respuesta que ya no
    // corresponde a lo que se está mostrando.
    setLoading(true);
    // Avisa a la pantalla que empiece a mostrar el loader.
    getDoc(doc(db, 'vacantes', vacanteId))
      // READ: pide el documento de la vacante por su ID.
      .then(snap => {
        if (cancel) return;
        // Si mientras se esperaba la respuesta el efecto ya quedó
        // obsoleto (cancel === true), se ignora el resultado por
        // completo — no se actualiza ningún estado.
        setVacante(snap.exists() ? ({ id: snap.id, ...snap.data() } as VacanteDetalle) : null);
        // snap.exists() → ¿el documento realmente existe en la base de
        // datos? (podría no existir si la vacante fue borrada después de
        // que se creó la notificación que apuntaba a ella).
        // "{ id: snap.id, ...snap.data() }" arma el objeto final: toma el
        // ID del documento (snap.id, que Firestore NO incluye dentro de
        // .data()) y le "esparce" (spread, con "...") encima TODOS los
        // campos del documento (título, descripción, etc.). Este patrón
        // "{ id: snap.id, ...snap.data() }" se repite en TODO el proyecto
        // cada vez que se lee un documento y se necesita su ID junto con
        // sus datos en un solo objeto.
        // "as VacanteDetalle" le dice a TypeScript "confía en que este
        // objeto tiene la forma de VacanteDetalle" (Firestore no sabe de
        // tipos: snap.data() devuelve un tipo genérico, así que hay que
        // afirmarlo manualmente).
      })
      .catch(() => { if (!cancel) setVacante(null); })
      // Si la consulta falla (sin internet, error de permisos), se trata
      // igual que "no encontrado": vacante queda en null.
      .finally(() => { if (!cancel) setLoading(false); });
      // Pase lo que pase (éxito o error), se apaga el loader — salvo que
      // el efecto ya esté cancelado.
    return () => { cancel = true; };
    // Función de limpieza: marca `cancel` como true si el efecto se
    // vuelve a ejecutar o el componente se desmonta antes de terminar.
  }, [visible, vacanteId]);

  if (!visible) return null;
  // Si el modal no debe mostrarse, el componente no dibuja absolutamente
  // nada (devolver `null` en un componente de React es válido: significa
  // "no renderices nada aquí").

  // Mientras carga (o si el id ya no existe), un loader liviano en vez de
  // dejar el toque de la notificación sin ninguna respuesta visible.
  if (loading || !vacante) {
    // Segundo estado posible: o SE ESTÁ cargando, o ya se terminó de
    // cargar pero NO se encontró ninguna vacante con ese ID. En ambos
    // casos se muestra el mismo modal "vacío" (con o sin el círculo
    // girando), para que el usuario nunca vea un toque que "no hizo
    // nada" — mejor mostrar algo (aunque sea un loader) que dejarlo sin
    // ninguna respuesta visible.
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        {/* transparent → el fondo del propio <Modal> es transparente,
            así que el fondo oscuro semi-transparente de abajo se ve como
            un "overlay" sobre la pantalla anterior, en vez de una
            pantalla sólida nueva.
            animationType="none" → sin animación de apertura/cierre (ver
            la memoria del proyecto sobre el bug de modales atascados:
            "slide"/"fade" podían dejar un Modal invisible o inclicable en
            la versión web, así que en todo el proyecto se prefiere "none"). */}
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : null}
          {/* Solo se muestra el círculo girando MIENTRAS loading es true.
              Si loading ya es false pero igual llegamos a este bloque,
              significa que se buscó y NO se encontró nada — se muestra
              simplemente el fondo oscuro vacío (una señal visual sutil de
              "esto ya no existe"), sin el loader ni ningún texto de
              error explícito. */}
        </View>
      </Modal>
    );
  }

  return <VacanteDetailModal visible={visible} vacante={vacante} onClose={onClose} />;
  // Tercer estado (el "camino feliz"): si ya terminó de cargar Y sí se
  // encontró la vacante, se delega el dibujo completo al componente
  // especializado VacanteDetailModal, pasándole los datos ya listos.
}
