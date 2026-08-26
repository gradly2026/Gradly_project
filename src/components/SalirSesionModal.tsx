/**
 * SalirSesionModal — confirmación de cierre de sesión, en una caja cuadrada
 * y centrada (mismo patrón visual que el modal de "Cerrar Sesión" del botón
 * manual del perfil en cada dashboard, ver dashboard-universidad.tsx).
 *
 * Se usa en dos lugares:
 *  - El botón manual "Cerrar sesión" de cada dashboard/perfil.
 *  - El guard de "atrás" del navegador (useBackNavigationGuard.ts), que antes
 *    usaba window.confirm() — un diálogo nativo del navegador, sin estilo, y
 *    que además bloqueaba el hilo de JS mientras estaba abierto.
 */
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useTranslation } from "../context/TranslationContext";

interface SalirSesionModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SalirSesionModal({
  visible,
  onConfirm,
  onCancel,
}: SalirSesionModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(7,5,15,0.85)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: colors.backgroundCard,
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 320,
            borderWidth: 1,
            borderColor: colors.primary35,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              color: colors.textPrimary,
              fontWeight: "bold",
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {t("cerrar_sesion")}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.white60,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            {t("cerrar_sesion_confirmar")}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.white8,
                alignItems: "center",
              }}
              onPress={onCancel}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                {t("accion_cancelar")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.error,
                alignItems: "center",
              }}
              onPress={onConfirm}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>
                {t("perfil_salir")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
