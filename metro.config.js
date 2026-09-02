// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── react-native-keyboard-controller → shim en JS puro ──
// La librería (dependencia transitiva de react-native-gifted-chat) trae un
// módulo NATIVO que NO está en Expo Go: al arrancar llama a
// `KeyboardControllerNative.getConstants()` y la app revienta
// ("_bindings.KeyboardControllerNative.getConstants is not a function").
// Se redirige el paquete entero a `shims/react-native-keyboard-controller.js`
// (passthrough + seguimiento del teclado con la API nativa de RN). Ver ese
// archivo para el porqué y el alcance.
const KBC_SHIM = path.resolve(__dirname, 'shims/react-native-keyboard-controller.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native-keyboard-controller' ||
    moduleName.startsWith('react-native-keyboard-controller/')
  ) {
    return { type: 'sourceFile', filePath: KBC_SHIM };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
