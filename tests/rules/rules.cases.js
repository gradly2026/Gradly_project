'use strict';
/* global __dirname */
/**
 * Casos de prueba de las reglas de Firestore (`firestore.rules`).
 *
 * Se ejecuta DENTRO del emulador: lo lanza `tests/rules/run.js` con
 * `firebase emulators:exec`, que fija FIRESTORE_EMULATOR_HOST. No se corre a
 * mano. Ver tests/rules/README.md.
 *
 * Cada caso hace UNA operación con la identidad de un usuario (con el mismo SDK
 * `firebase` que usa la app) y comprueba que las reglas la PERMITEN (ALLOW) o
 * la RECHAZAN (DENY). Todo ocurre en un emulador local con un proyecto `demo-`:
 * nada toca producción.
 *
 * Identidades (uid → rol, sembrado en `usuarios/{uid}` porque las reglas leen
 * ahí el rol con `get()`):
 *   stu1 / stu2 = estudiantes · emp1 / emp2 = empresas · uni1 / uni2 =
 *   universidades · adm1 = admin.  La inscripción A1 es de stu1 + emp1 + uni1.
 *   `owner` se salta las reglas: equivale al Admin SDK, o sea a las Cloud
 *   Functions (y se usa para sembrar los datos de cada caso).
 *
 * Variables opcionales: RULES_TEST_REGLAS (otro archivo de reglas a probar) y
 * RULES_TEST_SOLO (ids separados por coma, o solo la letra de un grupo: "E,U1").
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, deleteApp } = require('firebase/app');
const {
  getFirestore, connectFirestoreEmulator, terminate, doc, getDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, serverTimestamp, deleteField, FieldPath, setLogLevel,
} = require('firebase/firestore');

setLogLevel('silent');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARCHIVO_REGLAS = process.env.RULES_TEST_REGLAS
  ? path.resolve(process.env.RULES_TEST_REGLAS)
  : path.join(RAIZ, 'firestore.rules');
const [HOST, PUERTO_TXT] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const PUERTO = Number(PUERTO_TXT);
const PROYECTO = 'demo-gradly';
const URL_EMULADOR = `http://${HOST}:${PUERTO}`;

// ── Identidades ────────────────────────────────────────────────────────
const clientes = [];
function nuevoCliente(nombre, token) {
  const app = initializeApp({ projectId: PROYECTO }, `${nombre}-${clientes.length}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, PUERTO, { mockUserToken: token });
  clientes.push({ app, db });
  return db;
}
const owner = nuevoCliente('owner', 'owner');
const usuarios = {};
for (const uid of ['stu1', 'stu2', 'emp1', 'emp2', 'uni1', 'uni2', 'adm1']) {
  usuarios[uid] = nuevoCliente(uid, { sub: uid });
}
const dbDe = (uid) => (uid === 'owner' ? owner : usuarios[uid]);

// ── Referencias y datos de apoyo ───────────────────────────────────────
const A = (uid, id) => doc(dbDe(uid), `asignaciones_cupo/${id}`);
const RG = (uid) => doc(dbDe(uid), 'registros_asistencia/A1_2026-09-21');
const AJ = (uid, id) => doc(dbDe(uid), `ajustes_asistencia/${id}`);
const TOP = (uid) => doc(dbDe(uid), 'ranking_plataforma/top_estudiantes');
const VE = (uid, id) => doc(dbDe(uid), `verificaciones_empresa/${id}`);
const PP = (uid, id) => doc(dbDe(uid), `perfiles_publicos_estudiantes/${id}`);
const PE = (uid, id) => doc(dbDe(uid), `perfiles_estudiantes/${id}`);
const RP = (uid, id) => doc(dbDe(uid), `reportes/${id}`);
// Reporte tal cual lo crean reporteService / contratoService (los 3 sitios del cliente).
const NUEVO_REPORTE = (yo, extra = {}) => ({
  reportado_id: 'stu2', reportante_id: yo, reportador_id: yo, motivo: 'Contenido inapropiado',
  tipo: 'usuario', descripcion: 'x', estado: 'abierto', fecha: serverTimestamp(), ...extra,
});
const diaAsist = (dia) => new FieldPath('asistencias', dia);

const BASE = () => ({
  estudianteId: 'stu1', universidadId: 'uni1', empresaId: 'emp1',
  estado: 'tomado', finalizada: false, vacanteTitulo: 'Pasantia de prueba',
  horario: { dias: ['Lunes'], horaInicio: '08:00 AM', horaFin: '12:00 PM' },
  fechaPresentacion: '2026-09-21',
});
const SALIDA = () => ({ salidaConfirmada: true, salidaConfirmadaAt: serverTimestamp(), salidaConfirmadaPor: 'emp1' });
const NUEVO_REG = () => ({ asignacionId: 'A1', estudianteId: 'stu1', empresaId: 'emp1', universidadId: 'uni1', fecha: '2026-09-22', estado: 'presente', tardanzaMin: 0 });
const NUEVO_AJ = () => ({ empresaId: 'emp1', estudianteId: 'stu1', universidadId: 'uni1', dias: [] });

// Cierre por horas tal cual lo hace `finalizarInscripcionPorHoras`
// (src/services/reclamoCuposService.ts): transacción que relee y hace tx.update.
const cierrePorHoras = (uid, id) => () => runTransaction(dbDe(uid), async (tx) => {
  const ref = A(uid, id);
  const snap = await tx.get(ref);
  if (!snap.exists()) return;
  tx.update(ref, { finalizada: true, finalizadaAt: serverTimestamp(), horasCumplidas: 22 });
});

// ── Estado inicial de cada caso ─────────────────────────────────────────
async function reiniciar() {
  const r = await fetch(`${URL_EMULADOR}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`No se pudo limpiar el emulador: ${r.status}`);
  const poner = (ruta, datos) => setDoc(doc(owner, ruta), datos);
  await Promise.all([
    poner('usuarios/stu1', { rol: 'estudiante' }), poner('usuarios/stu2', { rol: 'estudiante' }),
    poner('usuarios/emp1', { rol: 'empresa' }), poner('usuarios/emp2', { rol: 'empresa' }),
    poner('usuarios/uni1', { rol: 'universidad' }), poner('usuarios/uni2', { rol: 'universidad' }),
    poner('usuarios/adm1', { rol: 'admin' }),
    poner('perfiles_estudiantes/stu1', { universidad_id: 'uni1' }),
    poner('perfiles_estudiantes/stu2', { universidad_id: 'uni2' }),
    poner('asignaciones_cupo/A1', BASE()),
    poner('asignaciones_cupo/A2', { ...BASE(), asistencias: { '2026-09-21': 480 } }),
    poner('registros_asistencia/A1_2026-09-21', { asignacionId: 'A1', estudianteId: 'stu1', empresaId: 'emp1', universidadId: 'uni1', fecha: '2026-09-21', estado: 'presente', tardanzaMin: 0 }),
    poner('ajustes_asistencia/A1', { empresaId: 'emp1', estudianteId: 'stu1', universidadId: 'uni1', dias: [] }),
    poner('codigos_asistencia/12345678', { asignacionId: 'A1', usado: false }),
    poner('ranking_plataforma/top_estudiantes', { lista: [] }),
    poner('perfiles_publicos_estudiantes/stu2', { nombre_completo: 'Estudiante Dos', calificacion_promedio: 5 }),
    poner('reportes/R1', { reportado_id: 'stu2', reportante_id: 'stu1', reportador_id: 'stu1', motivo: 'x', tipo: 'usuario', estado: 'abierto' }),
    poner('verificaciones_empresa/emp1', { nit: '0614-010101-101-1', contacto_documento_tipo: 'dui', contacto_documento_numero: '000000000' }),
  ]);
}

async function cargarReglas(texto) {
  const r = await fetch(`${URL_EMULADOR}/emulator/v1/projects/${PROYECTO}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: texto }] } }),
  });
  if (!r.ok) throw new Error(`Las reglas no se pudieron cargar (¿error de sintaxis?): ${r.status} ${await r.text()}`);
}

async function intentar(operacion) {
  try {
    await operacion();
    return 'ALLOW';
  } catch (e) {
    const t = String((e && (e.code || e.message)) || e);
    return /permission-denied|PERMISSION_DENIED|insufficient permissions/i.test(t) ? 'DENY' : `ERROR(${t.slice(0, 80)})`;
  }
}

// ── Casos: [id, descripción, operación, resultado esperado] ─────────────
const CASOS = [
  // ── asignaciones_cupo · creación ──
  ['C1', 'estudiante crea su inscripción (payload normal)', () => setDoc(A('stu1', 'N1'), BASE()), 'ALLOW'],
  ['C2', 'estudiante crea su inscripción YA con asistencias (guardia de `asistencias`)', () => setDoc(A('stu1', 'N2'), { ...BASE(), asistencias: { '2026-09-21': 480 } }), 'DENY'],
  ['C3', 'estudiante crea la inscripción de OTRO estudiante', () => setDoc(A('stu1', 'N3'), { ...BASE(), estudianteId: 'stu2' }), 'DENY'],

  // ── asignaciones_cupo · estudiante dueño ──
  ['E1', 'estudiante cierra por horas (transacción, sin mapa)', cierrePorHoras('stu1', 'A1'), 'ALLOW'],
  ['E2', 'estudiante cierra por horas con el mapa YA existente (sin falsos positivos)', cierrePorHoras('stu1', 'A2'), 'ALLOW'],
  ['E3', 'estudiante agrega un día a asistencias (guardia)', () => updateDoc(A('stu1', 'A1'), diaAsist('2026-09-22'), 0), 'DENY'],
  ['E4', 'estudiante se agrega asistencia sobre un mapa existente (guardia)', () => updateDoc(A('stu1', 'A2'), diaAsist('2026-09-22'), 0), 'DENY'],
  ['E5', 'estudiante reemplaza el mapa completo (guardia)', () => updateDoc(A('stu1', 'A2'), { asistencias: { '2026-09-21': 0, '2026-09-22': 0 } }), 'DENY'],
  ['E6', 'estudiante borra el mapa (guardia)', () => updateDoc(A('stu1', 'A2'), { asistencias: deleteField() }), 'DENY'],
  ['E7', 'estudiante mezcla un campo normal + asistencias en el mismo update (guardia)', () => updateDoc(A('stu1', 'A1'), { horasCumplidas: 5, asistencias: { '2026-09-21': 480 } }), 'DENY'],
  ['E8', 'estudiante reenvía el mapa IGUAL junto a un campo normal (no cambia, se permite)', () => updateDoc(A('stu1', 'A2'), { asistencias: { '2026-09-21': 480 }, horasCumplidas: 3 }), 'ALLOW'],
  ['E9', 'estudiante intenta cambiar estudianteId', () => updateDoc(A('stu1', 'A1'), { estudianteId: 'stu2' }), 'DENY'],
  ['E10', 'OTRO estudiante intenta editar la inscripción', () => updateDoc(A('stu2', 'A1'), { horasCumplidas: 1 }), 'DENY'],

  // ── asignaciones_cupo · universidad ──
  ['U1', 'universidad edita asistencias (guardia)', () => updateDoc(A('uni1', 'A1'), diaAsist('2026-09-22'), 0), 'DENY'],
  ['U2', 'universidad edita un campo normal', () => updateDoc(A('uni1', 'A1'), { notaUniversidad: 'ok' }), 'ALLOW'],
  ['U3', 'OTRA universidad intenta editar', () => updateDoc(A('uni2', 'A1'), { notaUniversidad: 'x' }), 'DENY'],

  // ── asignaciones_cupo · empresa ──
  ['M1', 'empresa fija el Día 1 (fechaPresentacion + At)', () => updateDoc(A('emp1', 'A1'), { fechaPresentacion: '2026-09-22', fechaPresentacionAt: serverTimestamp() }), 'ALLOW'],
  ['M2', 'empresa cierra la inscripción (false→true, solo sus 3 campos)', () => updateDoc(A('emp1', 'A1'), { finalizada: true, finalizadaAt: serverTimestamp(), horasCumplidas: 22 }), 'ALLOW'],
  ['M3', 'empresa intenta escribir asistencias', () => updateDoc(A('emp1', 'A1'), diaAsist('2026-09-22'), 0), 'DENY'],
  ['M4', 'empresa intenta editar un campo ajeno (estado)', () => updateDoc(A('emp1', 'A1'), { estado: 'cancelado' }), 'DENY'],
  ['M5', 'OTRA empresa intenta fijar el Día 1', () => updateDoc(A('emp2', 'A1'), { fechaPresentacion: '2026-09-22', fechaPresentacionAt: serverTimestamp() }), 'DENY'],

  // ── asignaciones_cupo · admin desde el cliente y servidor ──
  ['D1', 'admin (desde el cliente) edita asistencias (guardia)', () => updateDoc(A('adm1', 'A1'), diaAsist('2026-09-22'), 0), 'DENY'],
  ['D2', 'admin edita un campo normal', () => updateDoc(A('adm1', 'A1'), { estado: 'cancelado' }), 'ALLOW'],
  ['S1', 'SERVIDOR (Admin SDK) escribe un día en asistencias', () => updateDoc(A('owner', 'A1'), diaAsist('2026-09-22'), 480), 'ALLOW'],
  ['S2', 'SERVIDOR (Admin SDK) escribe otro día sobre un mapa existente', () => updateDoc(A('owner', 'A2'), diaAsist('2026-09-22'), 570), 'ALLOW'],

  // ── asignaciones_cupo · lecturas ──
  ['R1', 'lee el estudiante dueño', () => getDoc(A('stu1', 'A2')), 'ALLOW'],
  ['R2', 'lee la empresa dueña', () => getDoc(A('emp1', 'A2')), 'ALLOW'],
  ['R3', 'lee la universidad dueña', () => getDoc(A('uni1', 'A2')), 'ALLOW'],
  ['R4', 'lee el admin', () => getDoc(A('adm1', 'A2')), 'ALLOW'],
  ['R5', 'lee OTRO estudiante', () => getDoc(A('stu2', 'A2')), 'DENY'],
  ['R6', 'lee OTRA empresa', () => getDoc(A('emp2', 'A2')), 'DENY'],
  ['R7', 'lee OTRA universidad', () => getDoc(A('uni2', 'A2')), 'DENY'],

  // ── registros_asistencia: lo lee el trío, lo crea solo el servidor, la empresa solo confirma la salida ──
  ['G1', 'registro: lo lee el estudiante', () => getDoc(RG('stu1')), 'ALLOW'],
  ['G2', 'registro: lo lee la empresa', () => getDoc(RG('emp1')), 'ALLOW'],
  ['G3', 'registro: lo lee la universidad', () => getDoc(RG('uni1')), 'ALLOW'],
  ['G4', 'registro: lo lee el admin', () => getDoc(RG('adm1')), 'ALLOW'],
  ['G5', 'registro: NO lo lee otro estudiante', () => getDoc(RG('stu2')), 'DENY'],
  ['G6', 'registro: NO lo lee otra empresa', () => getDoc(RG('emp2')), 'DENY'],
  ['G7', 'registro: NO lo lee otra universidad', () => getDoc(RG('uni2')), 'DENY'],
  ['G8', 'registro: la empresa intenta CREAR uno (solo el servidor)', () => setDoc(doc(usuarios.emp1, 'registros_asistencia/A1_2026-09-22'), NUEVO_REG()), 'DENY'],
  ['G9', 'registro: el estudiante intenta CREAR uno', () => setDoc(doc(usuarios.stu1, 'registros_asistencia/A1_2026-09-22'), NUEVO_REG()), 'DENY'],
  ['G10', 'registro: la empresa confirma la salida', () => updateDoc(RG('emp1'), SALIDA()), 'ALLOW'],
  ['G11', 'registro: la empresa intenta cambiar el estado a tarde', () => updateDoc(RG('emp1'), { estado: 'tarde' }), 'DENY'],
  ['G12', 'registro: la empresa intenta cambiar tardanzaMin', () => updateDoc(RG('emp1'), { tardanzaMin: 40 }), 'DENY'],
  ['G13', 'registro: la empresa mezcla salida + estado', () => updateDoc(RG('emp1'), { ...SALIDA(), estado: 'tarde' }), 'DENY'],
  ['G14', 'registro: el estudiante intenta confirmar la salida', () => updateDoc(RG('stu1'), SALIDA()), 'DENY'],
  ['G15', 'registro: la universidad intenta confirmar la salida', () => updateDoc(RG('uni1'), SALIDA()), 'DENY'],
  ['G16', 'registro: OTRA empresa intenta confirmar la salida', () => updateDoc(RG('emp2'), SALIDA()), 'DENY'],
  ['G17', 'registro: la empresa intenta borrarlo', () => deleteDoc(RG('emp1')), 'DENY'],
  ['G18', 'registro: SERVIDOR crea el registro manual (Admin SDK)', () => setDoc(doc(owner, 'registros_asistencia/A1_2026-09-22'), { ...NUEVO_REG(), manual: true }), 'ALLOW'],

  // ── ajustes_asistencia (días no computados): empresa/universidad, validado con get() a la inscripción ──
  ['H1', 'ajustes: la empresa crea el de su inscripción', () => setDoc(AJ('emp1', 'A2'), NUEVO_AJ()), 'ALLOW'],
  ['H2', 'ajustes: la universidad crea el de su inscripción', () => setDoc(AJ('uni1', 'A2'), NUEVO_AJ()), 'ALLOW'],
  ['H3', 'ajustes: el estudiante intenta crearlo', () => setDoc(AJ('stu1', 'A2'), NUEVO_AJ()), 'DENY'],
  ['H4', 'ajustes: la empresa lo crea con universidadId que no coincide', () => setDoc(AJ('emp1', 'A2'), { ...NUEVO_AJ(), universidadId: 'uni2' }), 'DENY'],
  ['H5', 'ajustes: OTRA empresa lo crea sobre una inscripción ajena', () => setDoc(AJ('emp2', 'A2'), { ...NUEVO_AJ(), empresaId: 'emp2' }), 'DENY'],
  ['H6', 'ajustes: la empresa actualiza los días', () => updateDoc(AJ('emp1', 'A1'), { dias: [{ fecha: '2026-09-22' }] }), 'ALLOW'],
  ['H7', 'ajustes: la universidad actualiza los días', () => updateDoc(AJ('uni1', 'A1'), { dias: [{ fecha: '2026-09-22' }] }), 'ALLOW'],
  ['H8', 'ajustes: el estudiante intenta actualizar los días', () => updateDoc(AJ('stu1', 'A1'), { dias: [{ fecha: '2026-09-22' }] }), 'DENY'],
  ['H9', 'ajustes: lo lee el estudiante', () => getDoc(AJ('stu1', 'A1')), 'ALLOW'],
  ['H10', 'ajustes: lo lee la empresa', () => getDoc(AJ('emp1', 'A1')), 'ALLOW'],
  ['H11', 'ajustes: lo lee la universidad', () => getDoc(AJ('uni1', 'A1')), 'ALLOW'],
  ['H12', 'ajustes: lo lee el admin', () => getDoc(AJ('adm1', 'A1')), 'ALLOW'],
  ['H13', 'ajustes: NO lo lee otro estudiante', () => getDoc(AJ('stu2', 'A1')), 'DENY'],
  ['H14', 'ajustes: NO lo lee otra empresa', () => getDoc(AJ('emp2', 'A1')), 'DENY'],
  ['H15', 'ajustes: leer uno que aún no existe (escuchar antes de crearse)', () => getDoc(AJ('stu2', 'NOEXISTE')), 'ALLOW'],

  // ── codigos_asistencia: cerrado a todo cliente (solo Cloud Functions) ──
  ['K1', 'códigos: un cliente intenta LEER un código', () => getDoc(doc(usuarios.emp1, 'codigos_asistencia/12345678')), 'DENY'],
  ['K2', 'códigos: un cliente intenta ESCRIBIR un código', () => setDoc(doc(usuarios.stu1, 'codigos_asistencia/87654321'), { x: 1 }), 'DENY'],

  // ── ranking_plataforma/top_estudiantes: lo leen empresa/universidad/admin; nadie escribe desde la app ──
  ['T1', 'Top 3: lo lee un estudiante (desde 2026-09-23 lo ve para motivarse)', () => getDoc(TOP('stu1')), 'ALLOW'],
  ['T2', 'Top 3: lo lee una empresa', () => getDoc(TOP('emp1')), 'ALLOW'],
  ['T3', 'Top 3: lo lee una universidad', () => getDoc(TOP('uni1')), 'ALLOW'],
  ['T4', 'Top 3: lo lee el admin', () => getDoc(TOP('adm1')), 'ALLOW'],
  ['T5', 'Top 3: el admin intenta escribirlo desde el cliente', () => setDoc(TOP('adm1'), { lista: [1] }), 'DENY'],
  ['T6', 'Top 3: una empresa intenta escribirlo', () => setDoc(TOP('emp1'), { lista: [1] }), 'DENY'],
  ['T7', 'Top 3: SERVIDOR lo escribe (Admin SDK)', () => setDoc(TOP('owner'), { lista: [] }), 'ALLOW'],

  // ── verificaciones_empresa: NIT + documento del representante — solo la
  // propia empresa (rol empresa, no cualquier uid) y el admin ──
  ['VE1', 'crea el suyo (empresa2, doc aún no existe)', () => setDoc(VE('emp2', 'emp2'), { nit: 'x', contacto_documento_tipo: 'dui', contacto_documento_numero: '111111111' }), 'ALLOW'],
  ['VE2', 'empresa intenta crear el de OTRA empresa (id no coincide con su uid)', () => setDoc(VE('emp1', 'emp2b'), { nit: 'x' }), 'DENY'],
  ['VE3', 'un estudiante intenta crear uno con su propio uid (uid coincide, pero no es rol empresa)', () => setDoc(VE('stu1', 'stu1'), { nit: 'x' }), 'DENY'],
  ['VE4', 'lee la propia empresa', () => getDoc(VE('emp1', 'emp1')), 'ALLOW'],
  ['VE5', 'lo lee el admin', () => getDoc(VE('adm1', 'emp1')), 'ALLOW'],
  ['VE6', 'OTRA empresa intenta leerlo', () => getDoc(VE('emp2', 'emp1')), 'DENY'],
  ['VE7', 'un estudiante intenta leerlo', () => getDoc(VE('stu1', 'emp1')), 'DENY'],
  ['VE8', 'una universidad intenta leerlo', () => getDoc(VE('uni1', 'emp1')), 'DENY'],
  ['VE9', 'la propia empresa lo actualiza', () => updateDoc(VE('emp1', 'emp1'), { nit: 'y' }), 'ALLOW'],
  ['VE10', 'el admin lo actualiza', () => updateDoc(VE('adm1', 'emp1'), { nit: 'z' }), 'ALLOW'],
  ['VE11', 'OTRA empresa intenta actualizarlo', () => updateDoc(VE('emp2', 'emp1'), { nit: 'y' }), 'DENY'],
  ['VE12', 'la propia empresa intenta BORRARLO (solo admin puede)', () => deleteDoc(VE('emp1', 'emp1')), 'DENY'],
  ['VE13', 'el admin lo borra', () => deleteDoc(VE('adm1', 'emp1')), 'ALLOW'],

  // ── perfiles_publicos_estudiantes: versión FILTRADA de los estudiantes destacados.
  // La leen todos los autenticados; la escribe SOLO el servidor. Y el perfil COMPLETO
  // de otro estudiante (DUI, teléfono, casa…) sigue cerrado para los estudiantes. ──
  ['PP1', 'un estudiante lee el perfil público de OTRO estudiante', () => getDoc(PP('stu1', 'stu2')), 'ALLOW'],
  ['PP2', 'una empresa lo lee', () => getDoc(PP('emp1', 'stu2')), 'ALLOW'],
  ['PP3', 'una universidad lo lee', () => getDoc(PP('uni1', 'stu2')), 'ALLOW'],
  ['PP4', 'el propio estudiante intenta editar su perfil público', () => setDoc(PP('stu2', 'stu2'), { nombre_completo: 'Otro' }), 'DENY'],
  ['PP5', 'un estudiante intenta escribir el de otro', () => setDoc(PP('stu1', 'stu2'), { nombre_completo: 'x' }), 'DENY'],
  ['PP6', 'una empresa intenta escribirlo', () => setDoc(PP('emp1', 'stu2'), { nombre_completo: 'x' }), 'DENY'],
  ['PP7', 'el admin intenta escribirlo desde el cliente', () => setDoc(PP('adm1', 'stu2'), { nombre_completo: 'x' }), 'DENY'],
  ['PP8', 'un estudiante intenta borrarlo', () => deleteDoc(PP('stu1', 'stu2')), 'DENY'],
  ['PP9', 'SERVIDOR (Admin SDK) lo escribe', () => setDoc(PP('owner', 'stu9'), { nombre_completo: 'Nuevo' }), 'ALLOW'],
  ['PP10', 'SERVIDOR (Admin SDK) lo borra', () => deleteDoc(PP('owner', 'stu2')), 'ALLOW'],
  ['PE1', 'un estudiante NO puede leer el perfil COMPLETO de otro estudiante', () => getDoc(PE('stu1', 'stu2')), 'DENY'],
  ['PE2', 'un estudiante SÍ lee el suyo', () => getDoc(PE('stu1', 'stu1')), 'ALLOW'],
  ['PE3', 'una empresa sigue leyendo el perfil completo (sin cambios)', () => getDoc(PE('emp1', 'stu1')), 'ALLOW'],

  // ── RP · reportes: cualquiera denuncia, pero como sí mismo y siempre 'abierto' ──
  // `estado` lo cambia SOLO la Cloud Function resolveReport (deja auditoría). Antes el
  // `create` solo pedía estar autenticado: se podía crear un reporte ya 'resuelto',
  // con un estado inventado ('abiert') o a nombre de otro usuario.
  ['RP1', 'un estudiante crea un reporte propio válido (como reporteService)', () => setDoc(RP('stu1', 'N1'), NUEVO_REPORTE('stu1')), 'ALLOW'],
  ['RP2', 'una empresa crea un reporte laboral válido con campos extra (como reportarEmpleado)', () => setDoc(RP('emp1', 'N2'), NUEVO_REPORTE('emp1', { tipo: 'laboral', contexto: 'laboral', contratoId: 'C1', reportado_nombre: 'Est' })), 'ALLOW'],
  ['RP3', 'crear un reporte ya en estado resuelto', () => setDoc(RP('stu1', 'N3'), NUEVO_REPORTE('stu1', { estado: 'resuelto' })), 'DENY'],
  ['RP4', 'crear un reporte con estado inventado (abiert)', () => setDoc(RP('stu1', 'N4'), NUEVO_REPORTE('stu1', { estado: 'abiert' })), 'DENY'],
  ['RP5', 'crear un reporte sin estado', () => setDoc(RP('stu1', 'N5'), (({ estado, ...resto }) => resto)(NUEVO_REPORTE('stu1'))), 'DENY'],
  ['RP6', 'crear un reporte a nombre de OTRO reportador (reportador_id ajeno)', () => setDoc(RP('stu1', 'N6'), NUEVO_REPORTE('stu1', { reportador_id: 'stu2' })), 'DENY'],
  ['RP7', 'crear un reporte atribuido a OTRO reportante (reportante_id ajeno)', () => setDoc(RP('stu1', 'N7'), NUEVO_REPORTE('stu1', { reportante_id: 'emp1' })), 'DENY'],
  ['RP8', 'crear un reporte que ya trae una resolucion', () => setDoc(RP('stu1', 'N8'), NUEVO_REPORTE('stu1', { resolucion: 'Ya resuelto' })), 'DENY'],
  ['RP9', 'el dueño intenta cambiar el estado de su propio reporte', () => updateDoc(RP('stu1', 'R1'), { estado: 'resuelto' }), 'DENY'],
  ['RP10', 'el admin intenta cambiar el estado desde el cliente (solo resolveReport)', () => updateDoc(RP('adm1', 'R1'), { estado: 'en_investigacion' }), 'DENY'],
  ['RP11', 'el admin edita un campo NO protegido del reporte', () => updateDoc(RP('adm1', 'R1'), { nota_admin: 'revisado' }), 'ALLOW'],
  ['RP12', 'SERVIDOR (Cloud Function resolveReport) cambia el estado', () => updateDoc(RP('owner', 'R1'), { estado: 'resuelto', resolucion: 'ok' }), 'ALLOW'],
  ['RP13', 'el reportador lee su propio reporte', () => getDoc(RP('stu1', 'R1')), 'ALLOW'],
  ['RP14', 'el reportado NO puede leer el reporte en su contra', () => getDoc(RP('stu2', 'R1')), 'DENY'],
];

// ── Ejecución ────────────────────────────────────────────────────────────
function seleccionados() {
  const filtro = String(process.env.RULES_TEST_SOLO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (filtro.length === 0) return CASOS;
  return CASOS.filter(([id]) => filtro.some((f) => id === f || (/^[A-Z]+$/.test(f) && id.replace(/\d+$/, '') === f)));
}

async function main() {
  const reglas = fs.readFileSync(ARCHIVO_REGLAS, 'utf8');
  await cargarReglas(reglas);
  const relativa = path.relative(RAIZ, ARCHIVO_REGLAS);
  console.log(`\nReglas probadas: ${relativa && !relativa.startsWith('..') ? relativa : ARCHIVO_REGLAS}`);

  const casos = seleccionados();
  const fallas = [];
  for (const [id, descripcion, operacion, esperado] of casos) {
    await reiniciar();
    const real = await intentar(operacion);
    const bien = real === esperado;
    if (!bien) fallas.push(`${id} (${descripcion}): esperaba ${esperado} y obtuvo ${real}`);
    console.log(`  ${bien ? 'ok  ' : 'MAL '} ${id.padEnd(4)} ${real.padEnd(6)} ${descripcion}`);
  }

  console.log(`\n${casos.length - fallas.length}/${casos.length} casos como se esperaba.`);
  if (fallas.length > 0) {
    console.log('\nFALLAS:');
    fallas.forEach((f) => console.log(`  - ${f}`));
  }

  await Promise.all(clientes.map((c) => terminate(c.db).catch(() => {})));
  await Promise.all(clientes.map((c) => deleteApp(c.app).catch(() => {})));
  process.exit(fallas.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\nERROR al correr las pruebas:', e && e.message ? e.message : e);
  process.exit(2);
});
