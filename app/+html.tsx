// +html.tsx — plantilla del documento HTML SOLO para web (Expo Router la usa
// para el render estático/SSR; en móvil se ignora por completo).
//
// Réplica EXACTA de la plantilla por defecto de expo-router (mismos <meta> y el
// mismo ScrollViewStyleReset) + una sola cosa añadida: se desactiva el
// traductor automático del navegador (Google Translate).
//
// Por qué: Gradly ya traduce su propio texto en la app (componente AutoText).
// Si además Chrome traduce la página, envuelve los nodos de texto en <font> y
// React pierde la referencia a esos nodos → al siguiente re-render condicional
// revienta con "Failed to execute 'removeChild' on 'Node'". Marcar el documento
// como "no traducir" evita esa colisión sin tocar ninguna funcionalidad.
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" translate="no" className="notranslate">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* No traducir automáticamente: la app tiene su propio traductor. */}
        <meta name="google" content="notranslate" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
