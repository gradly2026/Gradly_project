/**
 * Shim en JS puro de `react-native-keyboard-controller`.
 *
 * POR QUÉ EXISTE:
 * La librería trae un módulo NATIVO (`KeyboardControllerNative`) que NO está
 * incluido en Expo Go. Al cargar su `src/constants.ts` llama de una a
 * `KeyboardControllerNative.getConstants()` y la app revienta en el arranque:
 *   "_bindings.KeyboardControllerNative.getConstants is not a function".
 *
 * La ÚNICA parte del proyecto que la usa es `react-native-gifted-chat`
 * (importa `{ KeyboardProvider, useReanimatedKeyboardAnimation }`). Este archivo
 * reemplaza el paquete entero — vía `metro.config.js` (`resolveRequest`) — por
 * una versión sin módulo nativo: `KeyboardProvider` es passthrough y el hook
 * sigue el teclado con los eventos nativos de `Keyboard` de React Native + valores
 * de Reanimated, así el chat sigue esquivando el teclado en iOS/Android y no
 * rompe nada en web ni en Expo Go.
 *
 * Se pierde SOLO el gesto interactivo de cierre del teclado de la librería
 * original (un extra), no la funcionalidad de chat.
 */
import * as React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  useWindowDimensions as rnUseWindowDimensions,
  View,
} from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

const noop = () => {};
const removable = { remove: noop };

// Enum copiado de la librería (android.view.WindowManager.LayoutParams).
export const AndroidSoftInputModes = {
  SOFT_INPUT_ADJUST_NOTHING: 48,
  SOFT_INPUT_ADJUST_PAN: 32,
  SOFT_INPUT_ADJUST_RESIZE: 16,
  SOFT_INPUT_ADJUST_UNSPECIFIED: 0,
  SOFT_INPUT_IS_FORWARD_NAVIGATION: 256,
  SOFT_INPUT_MASK_ADJUST: 240,
  SOFT_INPUT_MASK_STATE: 15,
  SOFT_INPUT_MODE_CHANGED: 512,
  SOFT_INPUT_STATE_ALWAYS_HIDDEN: 3,
  SOFT_INPUT_STATE_ALWAYS_VISIBLE: 5,
  SOFT_INPUT_STATE_HIDDEN: 2,
  SOFT_INPUT_STATE_UNCHANGED: 1,
  SOFT_INPUT_STATE_UNSPECIFIED: 0,
  SOFT_INPUT_STATE_VISIBLE: 4,
};

export const KeyboardController = {
  setInputMode: noop,
  setDefaultMode: noop,
  setFocusTo: noop,
  dismiss: () => Keyboard.dismiss(),
  isVisible: () => false,
  state: () => ({ isVisible: false, height: 0 }),
  addListener: () => removable,
};

export const KeyboardEvents = { addListener: () => removable };
export const KeyboardControllerView = View;
export const KeyboardAvoidingView = RNKeyboardAvoidingView;
export const KeyboardGestureArea = ({ children, style }) =>
  React.createElement(View, { style }, children);
export const KeyboardStickyView = ({ children, style }) =>
  React.createElement(View, { style }, children);
export const KeyboardToolbar = () => null;
export const OverKeyboardView = ({ children }) => children ?? null;

/** Passthrough — no hace falta ningún contexto nativo. */
export const KeyboardProvider = ({ children }) =>
  React.createElement(React.Fragment, null, children);

/**
 * Sigue el alto del teclado con los eventos nativos de RN. `height` es NEGATIVO
 * cuando el teclado está abierto — misma convención que la librería original:
 * gifted-chat hace `translateY: height.value - offset` para subir el contenido.
 */
export function useReanimatedKeyboardAnimation() {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const dur = 220;
    const s1 = Keyboard.addListener(showEvt, (e) => {
      const h = e?.endCoordinates?.height ?? 0;
      height.value = withTiming(-h, { duration: dur });
      progress.value = withTiming(1, { duration: dur });
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      height.value = withTiming(0, { duration: dur });
      progress.value = withTiming(0, { duration: dur });
    });
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [height, progress]);

  return { height, progress };
}

// Resto de la superficie pública (no la usa gifted-chat, pero se deja por si
// algún import futuro la referencia): no-ops seguros.
export const useKeyboardAnimation = useReanimatedKeyboardAnimation;
export const useResizeMode = noop;
export const useKeyboardHandler = noop;
export const useGenericKeyboardHandler = noop;
export const useFocusedInputHandler = noop;
export const useReanimatedFocusedInput = () => ({ input: { value: null }, update: noop });
export const useKeyboardController = () => ({ setEnabled: noop, enabled: true });
export const useKeyboardState = () => ({ isVisible: false, height: 0 });
export const useWindowDimensions = rnUseWindowDimensions;

export default {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardEvents,
  KeyboardControllerView,
  KeyboardAvoidingView,
  KeyboardGestureArea,
  KeyboardStickyView,
  KeyboardToolbar,
  OverKeyboardView,
  KeyboardProvider,
  useReanimatedKeyboardAnimation,
  useKeyboardAnimation,
};
