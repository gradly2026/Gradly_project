# Guía 6 — Glosario para quien nunca vio React Native ni TypeScript

Términos que vas a encontrar constantemente en los comentarios de este
proyecto, explicados una sola vez aquí para no repetirlos en cada
archivo.

## JavaScript / TypeScript básico

- **`const` / `let`** — formas de declarar una variable. `const` no se
  puede reasignar después de creada (aunque si es un objeto o array, SÍ
  se pueden cambiar sus propiedades/elementos internos); `let` sí se
  puede reasignar.
- **`import` / `export`** — `export` hace que algo (una función, una
  constante, un componente) definido en un archivo pueda usarse desde
  otros archivos; `import` lo trae. `export default` marca UNA sola cosa
  como "la exportación principal" del archivo (se importa sin llaves:
  `import Foo from './archivo'`); `export const/function` (con llaves al
  importar: `import { Foo } from './archivo'`) permite exportar varias
  cosas del mismo archivo.
- **`async` / `await`** — una función `async` puede usar `await` adentro
  para "pausar" hasta que una operación lenta (como leer de Firebase)
  termine, sin bloquear el resto de la app mientras tanto. Toda función
  `async` devuelve automáticamente una `Promise`.
- **`Promise`** — una "promesa" de que en algún momento futuro vas a
  tener un resultado (o un error). `.then(resultado => ...)` reacciona al
  éxito, `.catch(error => ...)` al fallo, `.finally(() => ...)` corre
  siempre al terminar, haya salido bien o mal.
- **`try { } catch { }`** — ejecuta un bloque de código; si algo lanza un
  error, en vez de romper todo el programa, salta al bloque `catch` para
  manejarlo.
- **`?.` (optional chaining)** — `objeto?.propiedad` da `undefined` en
  vez de romper el programa si `objeto` fuera `null`/`undefined`.
- **`??` (nullish coalescing)** — `valor ?? repuesto` usa `valor`, salvo
  que sea `null`/`undefined`, en cuyo caso usa `repuesto`. Distinto de
  `||`, que también reemplaza otros valores "falsy" como `0` o `""`.
- **`...` (spread)** — `{ ...objeto, campo: nuevo }` copia todas las
  propiedades de `objeto` dentro de un objeto nuevo, y `campo` sobrescribe
  esa propiedad puntual. También sirve para arrays: `[...lista, item]`.
- **Destructuring** — `const { nombre, edad } = persona;` extrae
  propiedades de un objeto directo a variables sueltas, en vez de escribir
  `persona.nombre` y `persona.edad` cada vez.
- **`interface` / `type`** (TypeScript) — describen la FORMA que debe
  tener un valor (qué propiedades tiene, de qué tipo es cada una). No
  generan código real: solo existen mientras se escribe el programa, para
  que el editor avise de errores antes de ejecutarlo. Ejemplo:
  `interface Persona { nombre: string; edad: number }`.
- **`as Tipo`** — le dice a TypeScript "confía en mí, este valor es de
  este tipo", sin comprobarlo de verdad en tiempo de ejecución. Se usa
  mucho al leer datos de Firestore, porque Firestore no sabe de tipos de
  TypeScript.

## React / React Native

- **Componente** — una función de JavaScript que devuelve una descripción
  de "qué debe verse en pantalla" (usando JSX). Es la unidad básica con la
  que se arma toda interfaz: `<FloatingTopBar />`, `<VacanteDetailModal />`,
  una pantalla completa como `dashboard-empresa.tsx`...
- **JSX** — la sintaxis parecida a HTML que se escribe dentro del código
  de un componente (`<View><Text>Hola</Text></View>`). No es HTML real:
  cada etiqueta es en realidad una llamada a un componente, y las
  `{llaves}` permiten insertar valores/expresiones de JavaScript en medio.
- **Props** — los "parámetros" que recibe un componente desde quien lo
  usa: `<VacanteDetailModal visible={true} vacante={datos} />` — `visible`
  y `vacante` son props.
- **Estado (`useState`)** — una "variable con memoria" propia de un
  componente: cuando cambia (con su función `set...`), React vuelve a
  dibujar ese componente con el nuevo valor. `const [valor, setValor] =
  useState(inicial)`.
- **Efecto (`useEffect`)** — código que se ejecuta cuando el componente
  aparece en pantalla, o cuando cambian ciertos valores (su "array de
  dependencias" `[dep1, dep2]`). Se usa para cosas que no son puramente
  "dibujar la pantalla": pedir datos, suscribirse a algo, etc. Si
  `useEffect` devuelve una función, esa es la "limpieza": se ejecuta antes
  de que el efecto se repita, o cuando el componente desaparece.
- **Context (`createContext` / `useContext`)** — un mecanismo para
  compartir un valor (colores del tema, idioma activo, usuario logueado)
  con CUALQUIER componente de la app, sin tener que pasarlo manualmente
  como prop en cada nivel intermedio. Este proyecto tiene 3: `ThemeContext`,
  `TranslationContext`, `AuthContext`.
- **Hook** — cualquier función que empieza con `use` (`useState`,
  `useEffect`, `useTheme`, `useAuth`...) y que permite a un componente
  "engancharse" a alguna capacidad de React (estado, efectos, contexto...).
  Solo se pueden llamar dentro de componentes o de otros hooks.
- **`key` en listas** — al dibujar una lista con `.map()`, cada elemento
  necesita una prop `key` única, para que React sepa identificar cuál es
  cuál al actualizar la lista de forma eficiente.
- **Renderizado condicional** — patrones como `{condicion && <Algo/>}`
  (muestra `<Algo/>` solo si `condicion` es verdadera) o
  `{condicion ? <A/> : <B/>}` (muestra `<A/>` o `<B/>` según el caso).
- **`Modal`** — un componente de React Native que muestra contenido
  ENCIMA de toda la pantalla actual (como una ventana emergente).
- **`StyleSheet.create({...})`** — la forma "oficial" de definir estilos
  en React Native (el equivalente al CSS de una página web, pero como un
  objeto de JavaScript).

## Firebase (ver también [Guía 1](GUIA_01_FIREBASE_Y_CRUD.md))

- **Firestore** — la base de datos NoSQL (por documentos) que usa Gradly.
- **Colección / Documento** — una colección es como una "carpeta"; un
  documento es como un "archivo" con campos adentro, dentro de una colección.
- **CRUD** — Create (crear), Read (leer), Update (actualizar), Delete
  (eliminar): las 4 operaciones básicas sobre datos.
- **`db`, `auth`, `storage`** — las 3 conexiones a Firebase que exporta
  `src/config/firebaseConfig.ts`, usadas en todo el proyecto.
- **Transacción (`runTransaction`)** — un grupo de lecturas/escrituras a
  Firestore que se aplican TODAS juntas o NINGUNA, de forma seguraincluso
  si dos personas hacen algo al mismo tiempo sobre los mismos datos.
- **Cloud Function** — código que corre en los servidores de Google (no en
  el celular), al que la app le "pide favores" por internet (ver
  [Guía 5](GUIA_05_ESTRUCTURA_PROYECTO.md)).

## Dónde seguir aprendiendo

Si quieres profundizar más allá de este proyecto:
- [react.dev](https://react.dev) — documentación oficial de React (los
  conceptos de componentes, hooks, JSX aplican igual en React Native).
- [reactnative.dev](https://reactnative.dev) — documentación oficial de
  React Native.
- [docs.expo.dev](https://docs.expo.dev) — documentación de Expo (el
  framework que envuelve React Native en este proyecto: Expo Router,
  Expo Fonts, etc.).
- [firebase.google.com/docs/firestore](https://firebase.google.com/docs/firestore) —
  documentación oficial de Firestore.
- [typescriptlang.org/docs](https://www.typescriptlang.org/docs/) —
  documentación oficial de TypeScript.
