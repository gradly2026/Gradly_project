#!/usr/bin/env node
'use strict';
/* global __dirname */
/**
 * Lanzador de las pruebas de reglas de Firestore.
 *
 *   node tests/rules/run.js          (o: npm run test:rules)
 *
 * Arranca el emulador de Firestore con `firebase emulators:exec` y corre ahí
 * `rules.cases.js` contra `firestore.rules`. Todo es local (proyecto `demo-`):
 * no toca producción ni pide credenciales. Ver tests/rules/README.md.
 *
 * Detalle importante: la CLI de Firebase 15 se niega a arrancar el emulador con
 * Java < 21. Si el `java` del PATH es más viejo, este lanzador busca un JDK 21+
 * instalado en el equipo y lo usa SOLO para esta ejecución (no cambia el PATH
 * ni nada del sistema).
 *
 * Variables opcionales:
 *   RULES_TEST_PORT    puerto del emulador (por defecto 8181)
 *   RULES_TEST_REGLAS  otro archivo de reglas a probar (p. ej. un borrador)
 *   RULES_TEST_SOLO    correr solo esos casos: "E3,E4" o la letra de un grupo ("E")
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const CASOS = path.join(__dirname, 'rules.cases.js');
const PUERTO = Number(process.env.RULES_TEST_PORT) || 8181;
const REGLAS = process.env.RULES_TEST_REGLAS
  ? path.resolve(process.env.RULES_TEST_REGLAS)
  : path.join(RAIZ, 'firestore.rules');
const MIN_JAVA = 21;
const ES_WINDOWS = process.platform === 'win32';

function salir(mensaje) {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

// ── Java 21+ ───────────────────────────────────────────────────────────
function versionMayor(java) {
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return 0;
  const m = /version "(\d+)/.exec(`${r.stdout}\n${r.stderr}`);
  return m ? Number(m[1]) : 0;
}

function hijos(dir) {
  try {
    return fs.readdirSync(dir).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

/** Carpetas donde suele haber JDKs instalados (además de JAVA_HOME). */
function jdksInstalados() {
  const raices = ES_WINDOWS
    ? ['Program Files', 'Program Files (x86)'].flatMap((p) =>
        ['Android\\openjdk', 'Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft']
          .map((d) => path.join('C:\\', p, d)))
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt', '/usr/local/opt'];
  const jdks = raices.flatMap(hijos);
  if (process.env.JAVA_HOME) jdks.unshift(process.env.JAVA_HOME);
  // En macOS el JDK real está en <jdk>/Contents/Home.
  return jdks.map((j) => (fs.existsSync(path.join(j, 'Contents', 'Home')) ? path.join(j, 'Contents', 'Home') : j));
}

/** Devuelve { home } de un JDK 21+ ({ home: null } = el java del PATH sirve), o null. */
function buscarJava() {
  if (versionMayor('java') >= MIN_JAVA) return { home: null };
  const exe = ES_WINDOWS ? 'java.exe' : 'java';
  let mejor = null;
  for (const home of jdksInstalados()) {
    const bin = path.join(home, 'bin', exe);
    if (!fs.existsSync(bin)) continue;
    const version = versionMayor(bin);
    if (version >= MIN_JAVA && (!mejor || version > mejor.version)) mejor = { home, version };
  }
  return mejor;
}

const java = buscarJava();
if (!java) {
  salir(
    `No encontré Java ${MIN_JAVA} o superior: la CLI de Firebase lo exige para el emulador de Firestore.\n` +
    `Instala un JDK ${MIN_JAVA}+ (p. ej. Temurin: https://adoptium.net) y vuelve a correr esto.`,
  );
}

// ── Firebase CLI ───────────────────────────────────────────────────────
const CLI = ES_WINDOWS ? 'firebase.cmd' : 'firebase';
const cli = spawnSync(CLI, ['--version'], { encoding: 'utf8', shell: ES_WINDOWS });
if (cli.error || cli.status !== 0) {
  salir('No encontré la CLI de Firebase. Instálala con: npm install -g firebase-tools');
}
if (!fs.existsSync(REGLAS)) salir(`No existe el archivo de reglas: ${REGLAS}`);

// ── Configuración temporal (así no se ensucia el repo con logs ni config) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gradly-rules-'));
fs.writeFileSync(
  path.join(tmp, 'firebase.json'),
  JSON.stringify({
    firestore: { rules: 'firestore.rules' },
    emulators: { firestore: { host: '127.0.0.1', port: PUERTO }, ui: { enabled: false } },
  }, null, 2),
);
fs.copyFileSync(REGLAS, path.join(tmp, 'firestore.rules'));
// Un puente de una línea evita problemas de comillas con rutas que tengan espacios.
fs.writeFileSync(path.join(tmp, 'correr-casos.js'), `require(${JSON.stringify(CASOS)});\n`);

const env = { ...process.env, RULES_TEST_REGLAS: REGLAS };
if (java.home) {
  const clavePath = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env.JAVA_HOME = java.home;
  env[clavePath] = `${path.join(java.home, 'bin')}${path.delimiter}${env[clavePath] || ''}`;
  console.log(`Usando el JDK de ${java.home} solo para esta ejecución.`);
}

const args = ['emulators:exec', '--only', 'firestore', '--project', 'demo-gradly', '--config', 'firebase.json', 'node correr-casos.js'];
const argv = ES_WINDOWS ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
const r = spawnSync(CLI, argv, { cwd: tmp, env, stdio: 'inherit', shell: ES_WINDOWS });

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* la carpeta temporal la limpia el sistema */
}
process.exit(r.status === null ? 1 : r.status);
