# 🏢 DIAGNÓSTICO EXHAUSTIVO — `app/dashboard-empresa.tsx`

**Fecha:** Junio 5, 2026
**Alcance:** Análisis completo del panel de Empresa (estructura, estados, funciones, componentes, modales, estilos) y su relación con Firebase (Firestore + Auth + Storage).
**Backend actual:** Firebase (migrado desde Supabase).

---

## 🎯 RESUMEN EJECUTIVO

`dashboard-empresa.tsx` es el **panel de control del rol Empresa**. Es un archivo monolítico (~1.560 líneas) que contiene:

- **1 componente principal** (`DashboardEmpresa`) con toda la lógica de estado y datos.
- **5 componentes de sección** (`SeccionInicio`, `SeccionVacantes`, `SeccionKanban`, `SeccionActivas`, `SeccionPagos`).
- **3 helpers de UI** (`MetricCard`, `FieldInput`, `PickerRow`).
- **7 modales** (Perfil, Nueva Vacante, Firma, Pago, Tarjeta, Detalle de Plan, y el nuevo Modal Dinámico de Guardado).
- **1 fábrica de estilos por tema** (`makeStyles` / `makeS`).

Funciona como un **CRUD en tiempo real** sobre Firestore: lee con `onSnapshot` (suscripciones vivas) y escribe con `addDoc` / `updateDoc`.

---

## 📦 PARTE 1: DEPENDENCIAS E IMPORTS

| Import | Para qué sirve |
|---|---|
| `firebase/firestore` (`addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where`) | Todas las operaciones de base de datos. |
| `firebase/auth` (`signOut`) | Cerrar sesión. |
| `firebase/storage` (`getDownloadURL, ref, uploadBytes`) | Subida del logo de la empresa. |
| `../src/config/firebaseConfig` (`auth, db, storage`) | Instancias singleton de Firebase. |
| `../src/services/pasantiaService` (`cambiarEstadoAplicacion, empresaFirmaConstancia`) | Lógica de negocio de pasantías encapsulada en un servicio. |
| `expo-image-picker` | Seleccionar imagen del logo. |
| `expo-location` | Captura de GPS (Método A de ubicación). |
| `MapViewer` | Visor de mapa (nativo `react-native-maps` / web Google Maps JS). |
| `useAuth`, `useAuthGuard('empresa')` | Sesión y protección de ruta por rol. |
| `useTheme` / `COLORS` / `FONTS` | Theming claro/oscuro. |
| Componentes `FloatingTopBar`, `FloatingSearchButton`, `FloatingNavBar`, `SolicitudesEmpresa`, `PerfilStatsEmpresa`, `RedGradlyBanner`, `OnboardingBubble`, `StorageAvatar`, `LiquidBackground`, `GlassCard`, `JellyButton` | UI Liquid Glass y módulos reutilizables. |
| `utils/cardValidation` | Validación estricta de tarjeta (Luhn, exp, CVV, titular). |

> ⚠️ **Imports sin uso detectados:** `maskExp`/`maskTarjeta` sí se usan; pero `OnboardingBubble`, `RedGradlyBanner` (sí usado), `IS_WIDE`, `shadow`, `useRef`, `Platform` conviene auditar — varios quedaron tras refactors. No rompen nada, solo ruido de linter.

---

## 🗃️ PARTE 2: RELACIÓN CON LA BASE DE DATOS (Firestore + Storage)

Colecciones y rutas que toca este archivo:

| Colección / Ruta | Operación | Dónde | Propósito |
|---|---|---|---|
| `perfiles_empresas/{uid}` | `onSnapshot` (lee) | `useEffect` perfil | Carga el perfil de la empresa en vivo (`plan`, `limiteVacantes`, `tarjeta_*`, `logo_url`, `verificado`). |
| `perfiles_empresas/{uid}` | `updateDoc` (escribe) | `handleUploadLogo`, `handleGuardarTarjeta` | Actualiza logo y datos de tarjeta. |
| `usuarios/{uid}` | `updateDoc` | `handleUploadLogo` | Sincroniza `foto_url` con el logo. |
| `vacantes` | `onSnapshot` con `where('empresa_id','==',uid)` | `useEffect` vacantes | Lista de vacantes propias en vivo. |
| `vacantes` | `addDoc` | `handlePublicarVacante` | **Crear** una vacante (incluye `ubicacion_coords` y `ubicacion_texto`). |
| `vacantes/{id}` | `updateDoc` | `toggleVacante` | Activar/pausar vacante. |
| `aplicaciones` | `onSnapshot` con `where('empresa_id','==',uid)` | `useEffect` apps | Candidaturas recibidas en vivo. |
| `aplicaciones/{id}` | `updateDoc` | `handlePagar` | Marca `pago_confirmado: true`. |
| `transacciones` | `getDocs` + `updateDoc` | `handlePagar` | Cierra la transacción de pago (simulado). |
| `aplicaciones_grupos` | `onSnapshot` con `where('empresaId','==',uid)` | **`SolicitudesEmpresa`** (en `Matchmaking.tsx`, render en `SeccionInicio`) | Solicitudes de alianza de universidades. **← origen del error de permisos (ver Parte 6).** |
| Storage `logos_empresas/{uid}/logo.jpg` | `uploadBytes` + `getDownloadURL` | `handleUploadLogo` | Guarda el archivo del logo. |
| Vía servicio: `aplicaciones`, `pasantias`, `constancias`, `transacciones` | — | `cambiarEstadoAplicacion`, `empresaFirmaConstancia` | Movimientos de Kanban y firma de constancias. |

---

## ⚙️ PARTE 3: INVENTARIO DE ESTADOS (`useState`)

**UI / navegación:** `seccion`, `showPerfil`, `logoutModalVisible`, `uploadingLogo`, `showPlanDetail`.
**Datos en vivo:** `perfil`, `vacantes`, `apps`.
**Modales de acción:** `showNuevaVacante`, `showCardModal`, `showFirmaModal`, `showPagoModal`, `firmaConfirmada`, `pagoProcesando`, `pagoMonto`.
**Formulario nueva vacante:** `nvTitulo`, `nvArea`, `nvModalidad`, `nvTipo`, `nvDesc`, `nvHoras`, `nvHorasSem`, `nvSkills`, `nvFechaLim`, `savingVac`.
**Mapa / ubicación:** `mapRegion`, `markerPos`, `ubicacionDetalle`, `procesandoUbicacion`.
**Tarjeta:** `cardNumero`, `cardExp`, `cardCvv`, `cardTitular`, `cardErrs`, `cardSaving`.
**Modal dinámico de guardado (nuevo):** `estadoGuardado` (`'idle'|'loading'|'success'|'error'`), `mensajeErrorGuardado`.

---

## 🧠 PARTE 4: FUNCIONES Y LÓGICA

### Suscripciones en tiempo real (3 × `useEffect`)
Montan listeners `onSnapshot` para `perfiles_empresas`, `vacantes` y `aplicaciones`, todos filtrados por el `uid` de la empresa. Se desuscriben al desmontar. **Esto es lo que mantiene el panel “vivo”.**

### Métricas (`useMemo`)
Deriva `vacantesActivas`, `pendientes`, `activos` (contratados) y `horasValidadas` a partir de `vacantes` y `apps`. Recalcula solo cuando cambian.

### Control de plan
`limiteVacantes` (default 2), `vacantesRestantes`, `puedeCrearVacante`. Bloquea la creación si se alcanzó el cupo del plan.

### Ubicación (3 métodos → 1 punto único)
- **`aplicarCoordenadas(lat,lng)`** — núcleo: fija `markerPos`, reenfoca `mapRegion`, llama a la **API REST de Google Geocoding** (`fetch`), valida que `formatted_address` contenga “El Salvador”, y rellena `ubicacionDetalle` (dirección + municipio/departamento de `address_components`). Maneja fallos limpiando el pin.
- **`capturarUbicacion()`** — Método A (GPS vía `expo-location`) → delega en `aplicarCoordenadas`.
- **`marcarDesdeMapa(coord)`** — Método B (toque en el mapa, `onMapPress`) → delega en `aplicarCoordenadas`.
- *(El Método C de pegar URL fue eliminado en un refactor previo.)*

### `handlePublicarVacante()` — **escritura crítica a `vacantes`**
1. Valida cupo de plan, campos obligatorios, ubicación (Presencial/Híbrido), horas (>0) y fecha (`YYYY-MM-DD`).
2. `setEstadoGuardado('loading')`.
3. Construye `payloadVacante` (limpio, incluye coords/texto de ubicación).
4. Sanitiza `undefined` (Firestore lo rechaza).
5. `await addDoc(collection(db,'vacantes'), payloadVacante)`.
6. Éxito → `setEstadoGuardado('success')` (NO cierra ni limpia aún).
7. Error → `setMensajeErrorGuardado(error.message)` + `setEstadoGuardado('error')`.
8. `finally` → `setSavingVac(false)`.

### `finalizarGuardadoExitoso()` + `useEffect` de auto-cierre
Cierra el modal grande y limpia el formulario. El `useEffect` sobre `estadoGuardado` auto-cierra: **success a los 2.5 s** (ejecuta la limpieza) y **error a los 4 s** (vuelve a `idle`).

### Otras acciones
- **`handleUploadLogo`** — `fetch→blob→uploadBytes→getDownloadURL`, actualiza `perfiles_empresas` + `usuarios` con cache-busting.
- **`toggleVacante`** — invierte `activa`.
- **`moverEstado`** — Kanban; usa `cambiarEstadoAplicacion` (confirma antes de `contratado`).
- **`handleFirmar`** — `empresaFirmaConstancia`, muestra check temporal.
- **`handlePagar`** — pago **simulado** (delay 2 s), cierra `transacciones` y marca `pago_confirmado`.
- **`handleGuardarTarjeta`** — valida (Luhn/exp/CVV/titular) y guarda **solo los 4 últimos dígitos**.

---

## 🧩 PARTE 5: COMPONENTES Y MODALES

### Secciones
- **`SeccionInicio`** — Banner de la red (`RedGradlyBanner`), métricas (`MetricCard`×4), **`SolicitudesEmpresa`** (alianzas) y actividad reciente (5 últimas apps).
- **`SeccionVacantes`** — botón “Publicar” (bloqueado por cupo), indicador de cupo y `FlatList` de vacantes con toggle Activa/Inactiva.
- **`SeccionKanban`** — tablero horizontal de 4 columnas (pendiente → contratado) con botones avanzar/retroceder.
- **`SeccionActivas`** — pasantías contratadas/finalizadas; botón “Firmar constancia” cuando `estado==='finalizado'`.
- **`SeccionPagos`** — tarjeta visual, pagos pendientes e historial.

### Modales
1. **Mi Perfil** — logo editable, plan actual, método de pago, estadísticas, footer (ayuda/acerca/cerrar sesión).
2. **Nueva Vacante** — formulario + bloque de mapa (solo Presencial/Híbrido) + `MapViewer` interactivo.
3. **Firma constancia** · 4. **Pago simulado** · 5. **Actualizar tarjeta** (validación en vivo) · 6. **Detalle de plan**.
7. **Modal Dinámico de Guardado (nuevo)** — overlay Liquid Glass con estados loading/success/error y auto-cierre.

---

## 🐞 PARTE 6: DIAGNÓSTICO DE LOS ERRORES DE CONSOLA

| # | Mensaje | Severidad | ¿Bloquea guardar? | Causa / Acción |
|---|---|---|---|---|
| 1 | `props.pointerEvents is deprecated` | 🟢 Cosmético | No | Lo emite **react-native-web** internamente. Inofensivo. Ya se silenció con `LogBox.ignoreLogs([...])` en `_layout.tsx` (afecta el overlay; en navegador puede seguir saliendo en consola, es seguro ignorarlo). |
| 2 | `Error en listener (solicitudes grupos empresa): FirebaseError: Missing or insufficient permissions.` | 🔴 **Real (pero NO del guardado)** | No | Proviene del listener de **`aplicaciones_grupos`** en `Matchmaking.tsx` (`SolicitudesEmpresa`, dentro de `SeccionInicio`). Las **reglas de seguridad de Firestore** no permiten a la empresa leer esa colección. Es un error de **reglas**, no del código. |
| 3 | `Google Maps ... loaded ... without loading=async` | 🟢 Cosmético | No | Esperado: revertimos a propósito al **loader clásico** estable. Solo es una sugerencia de rendimiento. |
| 4 | `google.maps.Marker is deprecated` | 🟢 Cosmético | No | Esperado: usamos `Marker` clásico por compatibilidad. Google garantiza ≥12 meses más de soporte. |

### 🔑 Conclusión clave sobre el guardado
**Ninguno de los 4 mensajes impide publicar la vacante.** El único error “real” (#2) pertenece a otra colección (`apliaciones_grupos`) y está **capturado** por su propio `error => console.warn(...)`, por lo que solo ensucia la consola.

➡️ Si al pulsar **Publicar** la vacante NO se guarda, el **Modal Dinámico** ahora mostrará el mensaje exacto de Firebase en el estado de **error**. El sospechoso más probable es que las **reglas de Firestore de la colección `vacantes`** no permitan `create` para el usuario empresa. Recomendación: revisar `firestore.rules` y asegurar algo como:

```
match /vacantes/{id} {
  allow read: if true; // o según negocio
  allow create: if request.auth != null
                && request.resource.data.empresa_id == request.auth.uid;
  allow update, delete: if request.auth != null
                && resource.data.empresa_id == request.auth.uid;
}
match /aplicaciones_grupos/{id} {
  allow read: if request.auth != null
              && resource.data.empresaId == request.auth.uid; // corrige el error #2
}
```

> El error #2 y un eventual fallo de guardado comparten la **misma raíz**: reglas de Firestore incompletas para el rol empresa. Ajustar las reglas elimina ambos.

---

## ✅ PARTE 7: ESTADO Y RECOMENDACIONES

- **Funcionalidad:** completa y en tiempo real; el modal dinámico ya elimina los `Alert` nativos en el guardado y expone el error real.
- **Acción prioritaria:** revisar/publicar las **reglas de Firestore** (`vacantes` y `aplicaciones_grupos`). Es lo único “real”.
- **Limpieza opcional:** quitar imports sin uso; considerar trocear el archivo (1.560 líneas) en sub-archivos por sección.
