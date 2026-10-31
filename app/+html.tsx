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

        {/* Animación de carga de UniJober (src/components/UniJoberIntro.tsx):
            si la intro va a jugar, la app arranca invisible (#root con
            opacity 0) para que no parpadee la página antes de la animación.
            La propia intro quita la clase cuando termina. */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html.uj-intro-on #root{opacity:0}html.uj-intro-on,html.uj-intro-on body{background:#08080c}html.uj-intro-on:not(.uj-ready) body{overflow:hidden}',
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(/[?&]intro=1/.test(location.search)||!sessionStorage.getItem('uj:intro'))document.documentElement.classList.add('uj-intro-on');}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
