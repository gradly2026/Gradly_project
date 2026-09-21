# Pruebas de las reglas de Firestore

Comprueban que `firestore.rules` permite lo que debe permitir y rechaza lo que debe rechazar, corriendo las reglas en el **emulador de Firestore** (el mismo motor de reglas de Google) con el mismo SDK `firebase` que usa la app. Todo es local, con un proyecto de prueba (`demo-gradly`): **no toca producción y no pide credenciales**.

## Cómo correrlas

```bash
npm run test:rules
# o directamente:
node tests/rules/run.js
```

Córrelas **antes de cada `firebase deploy --only firestore:rules`**. Sale con código 0 si todo pasa y 1 si algún caso no da lo esperado (útil para automatizarlo).

### Requisitos

- **Node 18+** (usa `fetch`).
- **CLI de Firebase** (`npm install -g firebase-tools`).
- **Java 21 o superior**: la CLI 15 se niega a arrancar el emulador con una versión menor. No hace falta cambiar el Java del sistema: `run.js` busca un JDK 21+ ya instalado (PATH, `JAVA_HOME`, `Program Files\Android\openjdk`, `Eclipse Adoptium`, `/usr/lib/jvm`…) y lo usa **solo durante esa ejecución**. Si no hay ninguno, te lo dice y sugiere instalar uno (por ejemplo Temurin).
- La primera vez la CLI descarga el emulador (unos 137 MB) a `~/.cache/firebase/emulators/`. Después ya no.

### Opciones (variables de entorno)

| Variable | Para qué |
| --- | --- |
| `RULES_TEST_SOLO=E3,E4` | Correr solo esos casos. Una letra sola corre el grupo entero (`RULES_TEST_SOLO=E`). |
| `RULES_TEST_REGLAS=ruta/borrador.rules` | Probar **otro archivo de reglas** (por ejemplo un borrador) sin tocar `firestore.rules`. |
| `RULES_TEST_PORT=8300` | Otro puerto para el emulador (por defecto 8181). |

Para ver qué cambia una modificación de reglas, prueba también la versión anterior: `git show HEAD:firestore.rules > /tmp/anterior.rules` y luego `RULES_TEST_REGLAS=/tmp/anterior.rules npm run test:rules`. Los casos que fallen ahí son justo los comportamientos que tu cambio modificó.

## Qué cubren (74 casos)

| Grupo | Colección | Qué comprueba |
| --- | --- | --- |
| `C`, `E`, `U`, `M`, `D`, `S`, `R` | `asignaciones_cupo` | Creación por el estudiante; cierre por horas (transacción) con y sin el mapa; la empresa fija el Día 1 y cierra; **el campo `asistencias` está cerrado a estudiante, universidad, empresa y admin** (solo lo escribe el servidor); lecturas de las tres partes y del admin; nadie ajeno lee ni edita. |
| `G` | `registros_asistencia` | Lo lee el trío + admin; solo el servidor lo crea; la empresa solo puede confirmar la salida (no tocar `estado` ni `tardanzaMin`). |
| `H` | `ajustes_asistencia` | Días no computados: los crean/actualizan empresa o universidad de esa inscripción (validado con `get()`); el estudiante no. |
| `K` | `codigos_asistencia` | Cerrada a todo cliente. |
| `T` | `ranking_plataforma/top_estudiantes` | Lo leen empresa, universidad y admin (no estudiantes); nadie lo escribe desde la app. |

Los casos marcados "(guardia)" en `rules.cases.js` son los que protegen el campo `asistencias`: si alguien afloja esa regla por error, fallan.

## Cómo funcionan

- Cada usuario es un cliente del SDK con un token de prueba (`mockUserToken`): `stu1`/`stu2` estudiantes, `emp1`/`emp2` empresas, `uni1`/`uni2` universidades, `adm1` admin. Su rol se siembra en `usuarios/{uid}`, porque las reglas lo leen con `get()`.
- `owner` se salta las reglas: equivale al **Admin SDK**, o sea a lo que hacen las Cloud Functions. Sirve para sembrar datos y para comprobar que el servidor sí puede escribir donde el cliente no.
- Antes de **cada** caso se vacía el emulador y se siembra el estado inicial, así que los casos son independientes.
- `run.js` arma una carpeta temporal con la configuración y una copia de las reglas, así el repo no se llena de logs ni de archivos de configuración.

## Cómo agregar un caso

En `rules.cases.js`, dentro de `CASOS`, agrega `[id, descripción, operación, esperado]`:

```js
['E11', 'estudiante intenta X', () => updateDoc(A('stu1', 'A1'), { campo: 1 }), 'DENY'],
```

- `operación` es una función que hace la escritura o lectura con la identidad que corresponda (`A('stu1', 'A1')` = la inscripción A1 vista como el estudiante `stu1`).
- `esperado` es `'ALLOW'` o `'DENY'`. Si cambias una regla **a propósito**, actualiza el esperado de los casos afectados.
- Si necesitas datos nuevos, siémbralos en `reiniciar()`.

## Lo que NO reemplazan

Prueban las reglas, no la app: no sustituyen probar con un login real (flujos de pantalla, Cloud Functions con sesión, índices de las consultas).
