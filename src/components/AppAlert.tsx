// ════════════════════════════════════════════════════════════════════════
// AppAlert — avisos y confirmaciones que SÍ funcionan en web.
//
// `Alert.alert` de React Native es un no-op total en react-native-web
// (`class Alert { static alert() {} }`): en el navegador no muestra nada y,
// peor, el `onPress` de sus botones nunca se dispara — así que cualquier
// confirmación con "Cancelar / Aceptar" queda muerta. Ver la memoria
// "Gotcha Alert.alert en web".
//
// Este módulo lo reemplaza con un <Modal> propio (que sí funciona en web y
// nativo) más una API imperativa parecida a Alert.alert para que migrar los
// call sites sea mecánico:
//
//   showAlert('Título', 'Mensaje')                     // aviso, 1 botón
//   if (await showConfirm({ title, message, destructive })) { ... }  // confirmación
//
// `AppAlertHost` se monta UNA vez cerca de la raíz (app/_layout.tsx). Si se
// llama a showAlert/showConfirm antes de que el host monte, la petición se
// guarda en un buffer y se muestra en cuanto el host está listo.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FONTS, useTheme, type GradlyColors } from "../context/ThemeContext";
import { translateSync } from "../services/translationService";
// El texto se traduce con translateSync (caché sincrónico, sin red) igual que
// hace patchAlert.ts con Alert.alert — así un texto ya localizado con t(...)
// pasa sin cambios y uno en español crudo se traduce si está en caché.

type BotonEstilo = "default" | "cancel" | "destructive";

interface Boton {
  texto: string;
  estilo: BotonEstilo;
  /** Valor con el que se resuelve la promesa si se pulsa este botón. */
  valor: boolean;
}

interface Item {
  id: number;
  titulo: string;
  mensaje?: string;
  botones: Boton[];
  resolver: (v: boolean) => void;
}

let _seq = 1;
let _push: ((item: Item) => void) | null = null;
const _buffer: Item[] = [];

function encolar(parcial: Omit<Item, "id" | "resolver">): Promise<boolean> {
  return new Promise((resolver) => {
    const item: Item = { ...parcial, id: _seq++, resolver };
    if (_push) _push(item);
    else _buffer.push(item);
  });
}

/**
 * Aviso informativo con un solo botón. Reemplazo directo de
 * `Alert.alert(titulo, mensaje)`. La promesa se resuelve al cerrarlo.
 */
export function showAlert(
  titulo: string,
  mensaje?: string,
  textoOk = "Entendido",
): Promise<boolean> {
  return encolar({
    titulo,
    mensaje,
    botones: [{ texto: textoOk, estilo: "default", valor: true }],
  });
}

/**
 * Confirmación de dos botones. Devuelve `true` si el usuario confirmó,
 * `false` si canceló o cerró. Reemplaza el patrón
 * `Alert.alert(titulo, mensaje, [{ text: 'Cancelar' }, { text: 'Sí', onPress }])`.
 */
export function showConfirm(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return encolar({
    titulo: opts.title,
    mensaje: opts.message,
    botones: [
      { texto: opts.cancelText ?? "Cancelar", estilo: "cancel", valor: false },
      {
        texto: opts.confirmText ?? "Confirmar",
        estilo: opts.destructive ? "destructive" : "default",
        valor: true,
      },
    ],
  });
}

/** Se monta una sola vez en app/_layout.tsx, dentro de los providers. */
export function AppAlertHost() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [cola, setCola] = useState<Item[]>([]);
  const actual = cola[0] ?? null;

  useEffect(() => {
    _push = (item) => setCola((q) => [...q, item]);
    if (_buffer.length) {
      const pendientes = _buffer.splice(0, _buffer.length);
      setCola((q) => [...q, ...pendientes]);
    }
    return () => {
      _push = null;
    };
  }, []);

  const cerrar = (item: Item, valor: boolean) => {
    item.resolver(valor);
    setCola((q) => q.filter((x) => x.id !== item.id));
  };

  if (!actual) return null;

  const unSoloBoton = actual.botones.length === 1;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => cerrar(actual, false)}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.titulo}>{translateSync(actual.titulo)}</Text>
          {!!actual.mensaje && (
            <Text style={s.mensaje}>{translateSync(actual.mensaje)}</Text>
          )}
          <View style={[s.fila, unSoloBoton && { flexDirection: "column" }]}>
            {actual.botones.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.boton,
                  b.estilo === "cancel" && s.botonCancel,
                  b.estilo === "destructive" && s.botonDestructive,
                  b.estilo === "default" && s.botonDefault,
                ]}
                onPress={() => cerrar(actual, b.valor)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    s.botonTxt,
                    b.estilo === "cancel" && s.botonTxtCancel,
                  ]}
                >
                  {translateSync(b.texto)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(7,5,15,0.85)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    card: {
      backgroundColor: C.backgroundCard,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    titulo: {
      fontSize: 17,
      fontFamily: FONTS.soraBold,
      color: C.textPrimary,
      textAlign: "center",
      marginBottom: 8,
    },
    mensaje: {
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: C.white60,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 22,
    },
    fila: { flexDirection: "row", gap: 12 },
    boton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    botonDefault: { backgroundColor: C.primary },
    botonCancel: { backgroundColor: C.white8 },
    botonDestructive: { backgroundColor: C.error },
    botonTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: "#fff" },
    botonTxtCancel: { color: C.textPrimary },
  });
