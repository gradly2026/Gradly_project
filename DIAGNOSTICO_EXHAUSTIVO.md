# 📊 DIAGNÓSTICO EXHAUSTIVO DEL PROYECTO GRADLY

**Fecha:** Mayo 29, 2026  
**Versión:** 1.0 - Análisis Completo  
**Alcance:** Configuración, Base de Datos, Archivos TSX, Flujos, Relaciones BD

---

## 🎯 RESUMEN EJECUTIVO

**Gradly** es una plataforma educativa móvil (React Native + Expo) diseñada para conectar:

- **Jóvenes Talentos** (profesionales independientes)
- **Empresas** (empleadores y practicantes)
- **Universidades** (instituciones educativas)
- **Alumnos/Estudiantes** (usuarios en formación)

Con funcionalidades de:

- Gestión de vacantes y aplicaciones
- Validación de horas sociales
- Perfiles públicos
- Evaluaciones
- Sistema de notificaciones

**Stack Tecnológico:**

- Frontend: React Native 0.81.5 + Expo 54.0
- Backend: Supabase (PostgreSQL) + Auth
- Almacenamiento: Supabase Storage (buckets public/private)
- Lenguaje: TypeScript + JavaScript
- Estado: Contextos React (Theme, Translation)

**Estado General:** Funcional con 8 dashboards por rol, pero con áreas de mejora en seguridad, RLS y arquitectura.

---

# 🔌 PARTE 1: CONFIGURACIÓN DE CONEXIÓN CON BASE DE DATOS

## 1.1 Proveedor Principal: SUPABASE

### Credenciales Configuradas

```
URL Principal: https://kbevyjupphyxrgcvdsgv.supabase.co
Anon Key: sb_publishable_-CLkZKX7jyJuzOA0QEG4uQ_JopGLyhE
Service Role Key: Requiere variables de entorno (.env)
```

### Archivos de Configuración

#### `lib/supabase.ts` (RECOMENDADO - ACTUAL)

**Ubicación:** Raíz del proyecto  
**Responsabilidad:** Cliente Supabase principal  
**Configuración:**

```typescript
// Platform detection (móvil vs web)
Platform.OS === "web" ? localStorage : ExpoSecureStoreAdapter

// ExpoSecureStoreAdapter: Almacenamiento encriptado nativo
- getItem() → SecureStore.getItemAsync()
- setItem() → SecureStore.setItemAsync()
- removeItem() → SecureStore.deleteItemAsync()

// Opciones de conexión
auth: {
  storage: ExpoSecureStoreAdapter (móvil) | undefined (web),
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false
}
```

**Uso en Proyecto:**

- Importado en: `iniciosesion.tsx`, `registro.tsx`, `authService.ts`
- Punto único de verdad para conexión BD

**Ventajas:**

- Seguro: Almacena sesiones encriptadas en dispositivo
- Cross-platform: Detecta automáticamente plataforma
- Session persistence: Mantiene usuario logueado entre sesiones

---

#### `config/supabase.js` (LEGADO - NO RECOMENDADO)

**Ubicación:** `config/`  
**Status:** Duplicado, no usado en componentes actuales  
**Diferencias:**

- Usa AsyncStorage en lugar de SecureStore
- Menos seguro (almacenamiento no encriptado en Android)
- Mantiene compatibilidad pero no necesario

**Recomendación:** ⚠️ ELIMINAR para evitar confusión

---

#### `lib/supabaseAdmin.ts`

**Ubicación:** `lib/`  
**Responsabilidad:** Cliente admin solo para lado servidor  
**Características:**

```typescript
- Requiere: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
- No persiste sesión (server-side)
- Permisos elevados (service_role_key)
- Usado para: Operaciones administrativas sin restricciones RLS
```

**Status en Proyecto:** Importado pero NO USADO en cliente  
**Recomendación:** Usar solo si se implementa backend con Edge Functions

---

## 1.2 Buckets de Almacenamiento

### Bucket: `public-media`

**Propósito:** Imágenes públicas  
**Contenido típico:** Logos empresas, banners, fotos de perfil  
**Permisos:** Público (lectura)  
**Función de subida:** `pickAndUploadImage("public-media", path)`  
**Retorna:** URL pública accesible

### Bucket: `private-docs`

**Propósito:** Documentos privados/sensibles  
**Contenido típico:** DUI, pasaportes, fotos de selfie, comprobantes  
**Permisos:** Privado (requiere RLS)  
**Función de subida:** `uploadImageIfExists("private-docs", path)`  
**Retorna:** Ruta privada (no URL pública)

**⚠️ Problema:** No hay RLS implementada en storage privado

---

## 1.3 Configuración de Autenticación (Auth)

### Métodos Soportados

1. **Email + Password**
   - Principal en el proyecto
   - Almacenado en auth.users de Supabase
   - Validación de fuerza de contraseña (no explícita en código)

2. **2FA / OTP** (Implementado en recuperación)
   - 8 dígitos OTP
   - Válido por 10 minutos
   - Resend cada 60 segundos

3. **No Implementados (posible futura expansión):**
   - Autenticación social (Google, GitHub)
   - Magic links por email
   - Biometría

### Session Management

```
Auth.users (Supabase)
    ↓ (crea)
Token + Session
    ↓ (almacena en)
ExpoSecureStore (móvil) | localStorage (web)
    ↓ (recupera automáticamente en)
supabase.auth.getUser()
```

---

# 📊 PARTE 2: BASE DE DATOS - ESQUEMA COMPLETO

## 2.1 Diagrama de Relaciones

```
┌─────────────────────────────────────────────────────┐
│                    auth.users                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ id (UUID) - PK                              │   │
│  │ email                                        │   │
│  │ user_metadata: {role: 'talento'|...}       │   │
│  └─────────────────────────────────────────────┘   │
└────────┬────────────────────────────────────────────┘
         │ 1-1 (ON DELETE CASCADE)
         ▼
┌─────────────────────────────────────────────────────┐
│              profiles (Central)                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ id (UUID, FK auth.users) - PK              │   │
│  │ email (UNIQUE)                             │   │
│  │ role: 'talento'|'empresa'|'universidad'... │   │
│  │ username (UNIQUE)                          │   │
│  │ status: 'active'|'pending'|'inactive'      │   │
│  │ nombre, telefono, departamento, ciudad     │   │
│  │ created_at, updated_at                     │   │
│  └─────────────────────────────────────────────┘   │
└────┬──────────────────┬───────────────────┬─────────┘
     │                  │                   │
  1-1│               1-N│                 1-N│
     │                  │                   │
     ▼                  ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   talentos   │  │  empresas    │  │universidades │
│              │  │              │  │              │
│ id - PK      │  │ id - PK      │  │ id - PK      │
│ profile_id   │  │ owner_id FK  │  │ owner_id FK  │
│ email        │  │ nombre       │  │ nombre       │
│ habilidades  │  │ industria    │  │ ciudad       │
│ idiomas JSON │  │ email_corp.  │  │ rector_*     │
│ universidad  │  │ logo, banner │  │ carreras[]   │
│ baneado      │  │ suscripción  │  │ status       │
│              │  │ baneado      │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
    N-1│              1-N│               1-N│
       │                 │                  │
       │         ┌───────▼────────────┐    │
       │         │    vacantes        │    │
       │         │                    │    │
       │         │ id - PK            │    │
       │         │ empresa_id FK ─────┘    │
       │         │ titulo                  │
       │         │ area, modalidad         │
       │         │ descripcion             │
       │         │ salario_min/max         │
       │         │ aplica_horas_sociales   │
       │         │ estado: 'activa'|...    │
       │         └───────┬────────────┘    │
       │              N-1│                 │
       │                 │                 │
    N-1│              1-N│              1-N│
       │                 │                 │
       │         ┌───────▼──────────┐     │
       │         │ aplicaciones      │     │
       │         │                  │     │
       │         │ id - PK          │     │
       │         │ talento_id FK ───┘     │
       │         │ vacante_id FK ────┐    │
       │         │ empresa_id FK     │    │
       │         │ estado (Kanban)   │    │
       │         │ fecha_aplicacion  │    │
       │         │ calificacion      │    │
       │         └──────────────────┘    │
       │                                  │
       └──────────────────┬───────────────┘
                       1-N│
                          ▼
              ┌──────────────────────┐
              │  solicitudes_horas   │
              │                      │
              │ id - PK              │
              │ grupo_id FK          │
              │ empresa_id FK ───────┘
              │ universidad_id FK    │
              │ horas_solicitadas    │
              │ horas_ofrecidas      │
              │ estado: 'en_revision'│
              │ fecha_inicio/fin     │
              │ certificado_digital  │
              └──────────────────────┘
```

---

## 2.2 Descripción Detallada de Tablas

### Tabla 1: `profiles` - Central de Usuarios

**Propósito:** Registro único de TODOS los usuarios del sistema  
**Relación con auth.users:** 1-1 (FK)

| Campo          | Tipo      | Restricción                          | Propósito                                    |
| -------------- | --------- | ------------------------------------ | -------------------------------------------- |
| `id`           | UUID      | PK, FK auth.users, ON DELETE CASCADE | Identificador único                          |
| `email`        | TEXT      | UNIQUE NOT NULL                      | Email principal de contacto                  |
| `role`         | TEXT      | CHECK (role IN (...))                | talento\|empresa\|universidad\|alumno\|admin |
| `username`     | TEXT      | UNIQUE NOT NULL                      | Identificador para login alternativo         |
| `nombre`       | TEXT      | NOT NULL                             | Nombre completo o razón social               |
| `status`       | TEXT      | DEFAULT 'pending'                    | active\|pending\|inactive\|bloqueado         |
| `telefono`     | TEXT      |                                      | Teléfono de contacto                         |
| `departamento` | TEXT      |                                      | Departamento (El Salvador)                   |
| `ciudad`       | TEXT      |                                      | Ciudad                                       |
| `bio`          | TEXT      |                                      | Biografía/descripción                        |
| `habilidades`  | TEXT      |                                      | Listado de habilidades                       |
| `idiomas`      | JSONB     |                                      | Array de {name, level}                       |
| `doc_tipo`     | TEXT      |                                      | dui\|pasaporte\|licencia                     |
| `doc_numero`   | TEXT      |                                      | Número de documento                          |
| `universidad`  | TEXT      |                                      | Universidad de formación                     |
| `area`         | TEXT      |                                      | Área de estudio                              |
| `cargo`        | TEXT      |                                      | Puesto/cargo (para empresas)                 |
| `linkedin`     | TEXT      |                                      | URL LinkedIn                                 |
| `instagram`    | TEXT      |                                      | Handle Instagram                             |
| `facebook`     | TEXT      |                                      | URL Facebook                                 |
| `tiktok`       | TEXT      |                                      | Handle TikTok                                |
| `github`       | TEXT      |                                      | URL GitHub                                   |
| `behance`      | TEXT      |                                      | URL Behance                                  |
| `created_at`   | TIMESTAMP | DEFAULT NOW()                        | Fecha creación                               |
| `updated_at`   | TIMESTAMP | DEFAULT NOW()                        | Última actualización                         |

**Índices:**

- `idx_profiles_username` - Búsqueda rápida por username
- `idx_profiles_email` - Búsqueda rápida por email
- `idx_profiles_role` - Filtro por rol

**Problemas Identificados:**

- ⚠️ Tabla demasiado genérica con campos nulos por rol
- ⚠️ No hay validación de datos específicos por rol
- ✅ Podría normalizarse en tablas separadas pero complica relaciones

---

### Tabla 2: `talentos` - Jóvenes Profesionales Independientes

**Propósito:** Datos detallados de profesionales independientes  
**Relación con profiles:** 1-1 (UNIQUE FK)

| Campo          | Tipo      | Restricción                  | Propósito                                    |
| -------------- | --------- | ---------------------------- | -------------------------------------------- |
| `id`           | UUID      | PK DEFAULT gen_random_uuid() | ID único                                     |
| `profile_id`   | UUID      | UNIQUE FK profiles, CASCADE  | Referencia a profile                         |
| `email`        | TEXT      | UNIQUE NOT NULL              | Email registrado                             |
| `nombre`       | TEXT      | NOT NULL                     | Nombre                                       |
| `username`     | TEXT      | UNIQUE NOT NULL              | Username único                               |
| `telefono`     | TEXT      |                              | Teléfono                                     |
| `departamento` | TEXT      |                              | Departamento                                 |
| `ciudad`       | TEXT      |                              | Ciudad                                       |
| `bio`          | TEXT      |                              | Biografía profesional                        |
| `habilidades`  | TEXT      |                              | Habilidades separadas por comas              |
| `idiomas`      | JSONB     |                              | Array: [{name: 'English', level: 'B2'}, ...] |
| `doc_tipo`     | TEXT      |                              | Tipo de documento                            |
| `doc_numero`   | TEXT      |                              | Número de documento                          |
| `universidad`  | TEXT      |                              | Universidad 1                                |
| `area`         | TEXT      |                              | Área 1                                       |
| `instagram`    | TEXT      |                              | Handle Instagram                             |
| `linkedin`     | TEXT      |                              | URL LinkedIn                                 |
| `tiktok`       | TEXT      |                              | Handle TikTok                                |
| `github`       | TEXT      |                              | URL GitHub                                   |
| `behance`      | TEXT      |                              | URL Behance                                  |
| `status`       | TEXT      | DEFAULT 'active'             | active\|inactive\|suspended                  |
| `baneado`      | BOOLEAN   | DEFAULT FALSE                | ¿Usuario baneado?                            |
| `motivo_baneo` | TEXT      |                              | Razón del ban                                |
| `baneo_hasta`  | DATE      |                              | Fecha de levantamiento de ban                |
| `foto_perfil`  | TEXT      |                              | URL de foto de perfil (public-media)         |
| `created_at`   | TIMESTAMP | DEFAULT NOW()                |                                              |
| `updated_at`   | TIMESTAMP | DEFAULT NOW()                |                                              |

**Índices:**

- `idx_talentos_profile_id` - FK rápido
- `idx_talentos_email` - Búsqueda por email
- `idx_talentos_username` - Login alternativo

**Relaciones N-1:**

- N talentos → 1 tabla (en solicitudes_horas, aplicaciones, etc.)
- Podría tener N universidades/áreas si se crea tabla separada

---

### Tabla 3: `empresas` - Empleadores y Practicantes

**Propósito:** Información de empresas registradas  
**Relación con auth.users:** N-1 (FK owner_id)

| Campo                | Tipo      | Restricción                  | Propósito                             |
| -------------------- | --------- | ---------------------------- | ------------------------------------- |
| `id`                 | UUID      | PK DEFAULT gen_random_uuid() | ID empresa                            |
| `owner_id`           | UUID      | FK auth.users, CASCADE       | Usuario propietario/admin             |
| `nombre`             | TEXT      | NOT NULL                     | Nombre oficial                        |
| `industria`          | TEXT      | NOT NULL                     | Sector (Tecnología, Finanzas, etc.)   |
| `descripcion`        | TEXT      |                              | Descripción de actividades            |
| `departamento`       | TEXT      |                              | Ubicación departamento                |
| `ciudad`             | TEXT      |                              | Ubicación ciudad                      |
| `direccion`          | TEXT      |                              | Dirección física                      |
| `telefono`           | TEXT      | NOT NULL                     | Teléfono empresa                      |
| `email_corporativo`  | TEXT      | UNIQUE NOT NULL              | Email corporativo                     |
| `web`                | TEXT      |                              | Sitio web                             |
| `logo`               | TEXT      |                              | URL del logo (public-media)           |
| `banner`             | TEXT      |                              | URL del banner (public-media)         |
| `instagram`          | TEXT      |                              | Handle Instagram                      |
| `facebook`           | TEXT      |                              | URL Facebook                          |
| `tiktok`             | TEXT      |                              | Handle TikTok                         |
| `rep_nombre`         | TEXT      |                              | Nombre del representante legal        |
| `rep_cargo`          | TEXT      |                              | Cargo del representante               |
| `rep_email`          | TEXT      |                              | Email del representante               |
| `rep_telefono`       | TEXT      |                              | Teléfono del representante            |
| `rep_dui`            | TEXT      |                              | DUI del representante                 |
| `rep_facebook`       | TEXT      |                              | Facebook del representante            |
| `rep_instagram`      | TEXT      |                              | Instagram del representante           |
| `foto_rep_dui`       | TEXT      |                              | Foto del DUI (private-docs)           |
| `foto_rep_selfie`    | TEXT      |                              | Selfie con documento (private-docs)   |
| `foto_rep`           | TEXT      |                              | Foto del representante (public-media) |
| `suscripcion_activa` | BOOLEAN   | DEFAULT TRUE                 | ¿Suscripción vigente?                 |
| `plan`               | TEXT      | DEFAULT 'basico'             | basico\|profesional\|premium          |
| `baneado`            | BOOLEAN   | DEFAULT FALSE                | ¿Empresa baneada?                     |
| `motivo_baneo`       | TEXT      |                              | Razón de ban                          |
| `baneo_hasta`        | DATE      |                              | Fecha de levantamiento                |
| `status`             | TEXT      | DEFAULT 'active'             | active\|inactive\|suspended           |
| `created_at`         | TIMESTAMP | DEFAULT NOW()                |                                       |
| `updated_at`         | TIMESTAMP | DEFAULT NOW()                |                                       |

**Relaciones 1-N:**

- 1 empresa → N vacantes
- 1 empresa → N aplicaciones (recibe)
- 1 empresa → N solicitudes_horas
- 1 empresa → 1 suscripción

---

### Tabla 4: `universidades` - Instituciones Educativas Aliadas

**Propósito:** Datos de universidades asociadas  
**Relación con auth.users:** N-1 (FK owner_id)

| Campo                 | Tipo      | Restricción                  | Propósito                     |
| --------------------- | --------- | ---------------------------- | ----------------------------- |
| `id`                  | UUID      | PK DEFAULT gen_random_uuid() | ID universidad                |
| `owner_id`            | UUID      | FK auth.users, CASCADE       | Usuario propietario           |
| `nombre`              | TEXT      | NOT NULL                     | Nombre oficial                |
| `departamento`        | TEXT      | NOT NULL                     | Departamento                  |
| `ciudad`              | TEXT      | NOT NULL                     | Ciudad                        |
| `direccion`           | TEXT      |                              | Dirección                     |
| `email_institucional` | TEXT      | UNIQUE NOT NULL              | Email oficial                 |
| `web`                 | TEXT      |                              | Sitio web                     |
| `telefono`            | TEXT      | NOT NULL                     | Teléfono                      |
| `descripcion`         | TEXT      |                              | Reseña institucional          |
| `logo`                | TEXT      |                              | URL logo (public-media)       |
| `banner`              | TEXT      |                              | URL banner (public-media)     |
| `instagram`           | TEXT      |                              | Instagram                     |
| `tiktok`              | TEXT      |                              | TikTok                        |
| `github`              | TEXT      |                              | GitHub                        |
| `behance`             | TEXT      |                              | Behance                       |
| `rector_nombre`       | TEXT      | NOT NULL                     | Nombre del rector             |
| `rector_doc_tipo`     | TEXT      | NOT NULL                     | Tipo documento                |
| `rector_doc_numero`   | TEXT      | NOT NULL                     | Número documento              |
| `foto_rector_dui`     | TEXT      |                              | Foto DUI (private-docs)       |
| `foto_rector_selfie`  | TEXT      |                              | Selfie con doc (private-docs) |
| `enc_nombre`          | TEXT      | NOT NULL                     | Nombre encargado académico    |
| `enc_telefono`        | TEXT      | NOT NULL                     | Teléfono encargado            |
| `enc_email`           | TEXT      | NOT NULL                     | Email encargado               |
| `enc_instagram`       | TEXT      |                              | Instagram encargado           |
| `enc_linkedin`        | TEXT      |                              | LinkedIn encargado            |
| `status`              | TEXT      | DEFAULT 'active'             | active\|inactive              |
| `estado`              | TEXT      | DEFAULT 'verified'           | verified\|pending\|rejected   |
| `created_at`          | TIMESTAMP | DEFAULT NOW()                |                               |
| `updated_at`          | TIMESTAMP | DEFAULT NOW()                |                               |

**Relaciones 1-N:**

- 1 universidad → N alumnos
- 1 universidad → N carreras
- 1 universidad → N grupos

---

### Tabla 5: `alumnos` - Estudiantes de Universidades Aliadas

**Propósito:** Registro de estudiantes vinculados a universidades  
**Relación con universidades:** N-1 (FK)

| Campo               | Tipo      | Propósito                       |
| ------------------- | --------- | ------------------------------- |
| `id`                | UUID      | PK                              |
| `universidad_id`    | UUID      | FK universidades                |
| `nombre`            | TEXT      | Nombre estudiante               |
| `email`             | TEXT      | Email institucional             |
| `carrera`           | TEXT      | Carrera/programa                |
| `semester`          | INT       | Semestre actual                 |
| `horas_requeridas`  | INT       | Total horas sociales requeridas |
| `horas_completadas` | INT       | Horas validadas hasta ahora     |
| `foto_perfil`       | TEXT      | URL foto (public-media)         |
| `status`            | TEXT      | active\|inactive\|suspended     |
| `created_at`        | TIMESTAMP |                                 |

**Relaciones N-1:**

- N alumnos → 1 universidad
- N alumnos → M grupos (relación N-M probablemente)
- N alumnos → N solicitudes_horas

---

### Tabla 6: `vacantes` - Ofertas de Empleo y Prácticas

**Propósito:** Ofertas de trabajo publicadas por empresas  
**Relación con empresas:** N-1 (FK)

| Campo                   | Tipo      | Propósito                           |
| ----------------------- | --------- | ----------------------------------- |
| `id`                    | UUID      | PK                                  |
| `empresa_id`            | UUID      | FK empresas                         |
| `titulo`                | TEXT      | Título de la posición               |
| `area`                  | TEXT      | Área/departamento                   |
| `ubicacion`             | TEXT      | Ubicación/ciudad                    |
| `departamento`          | TEXT      | Departamento                        |
| `modalidad`             | TEXT      | Remoto\|Presencial\|Hibrido         |
| `tipo`                  | TEXT      | tiempo_completo\|pasantia\|proyecto |
| `descripcion`           | TEXT      | Descripción del puesto              |
| `requisitos`            | JSONB     | Array de requisitos                 |
| `salario_min`           | INT       | Salario mínimo                      |
| `salario_max`           | INT       | Salario máximo                      |
| `mostrar_salario`       | BOOLEAN   | ¿Mostrar salario?                   |
| `aplica_horas_sociales` | BOOLEAN   | ¿Aplica para horas sociales?        |
| `estado`                | TEXT      | activa\|cerrada\|archivada\|draft   |
| `created_at`            | TIMESTAMP |                                     |
| `updated_at`            | TIMESTAMP |                                     |

**Relaciones 1-N:**

- 1 vacante → N aplicaciones

---

### Tabla 7: `aplicaciones` - Candidaturas de Talentos a Vacantes

**Propósito:** Registro de postulaciones  
**Relaciones:**

- N-1 con vacantes
- N-1 con talentos
- N-1 con empresas

| Campo              | Tipo      | Propósito                                                 |
| ------------------ | --------- | --------------------------------------------------------- |
| `id`               | UUID      | PK                                                        |
| `vacante_id`       | UUID      | FK vacantes                                               |
| `talento_id`       | UUID      | FK talentos                                               |
| `empresa_id`       | UUID      | FK empresas                                               |
| `estado`           | TEXT      | pendiente\|en_revision\|entrevista\|contratada\|rechazada |
| `fecha_aplicacion` | TIMESTAMP |                                                           |
| `calificacion`     | INT 1-5   | Calificación de empresa                                   |
| `comentarios`      | TEXT      | Feedback empresa                                          |

**Kanban States (en dashboard-empresa):**

- Amarillo: `pendiente`
- Púrpura: `en_revision`
- Azul: `entrevista`
- Verde: `contratada`
- Rojo: `rechazada`

---

### Tabla 8: `grupos` - Grupos de Estudiantes para Horas Sociales

**Propósito:** Agrupación de alumnos para validación de horas  
**Relación con universidades:** N-1 (FK)

| Campo              | Tipo      | Propósito                              |
| ------------------ | --------- | -------------------------------------- |
| `id`               | UUID      | PK                                     |
| `universidad_id`   | UUID      | FK universidades                       |
| `nombre`           | TEXT      | Nombre del grupo                       |
| `descripcion`      | TEXT      | Descripción                            |
| `horas_requeridas` | INT       | Horas totales a completar              |
| `profesor`         | TEXT      | Nombre del profesor responsable        |
| `estado`           | TEXT      | activo\|pausado\|completado\|archivado |
| `fecha_creacion`   | TIMESTAMP |                                        |
| `fecha_cierre`     | DATE      | Fecha target de finalización           |

**Relaciones:**

- 1 grupo → N estudiantes (N-M)
- 1 grupo → N solicitudes_horas

---

### Tabla 9: `solicitudes_horas` - Solicitudes de Validación de Horas

**Propósito:** Solicitud de empresa para validar horas sociales de grupo  
**Relaciones:** N-1 con (grupos, empresas, universidades)

| Campo                 | Tipo      | Propósito                                            |
| --------------------- | --------- | ---------------------------------------------------- |
| `id`                  | UUID      | PK                                                   |
| `grupo_id`            | UUID      | FK grupos                                            |
| `empresa_id`          | UUID      | FK empresas                                          |
| `universidad_id`      | UUID      | FK universidades                                     |
| `horas_solicitadas`   | INT       | Horas que universidad pide validar                   |
| `horas_ofrecidas`     | INT       | Horas que empresa propone                            |
| `estado`              | TEXT      | pendiente\|en_revision\|aprobada\|rechazada\|cerrada |
| `fecha_inicio`        | DATE      | Fecha inicio del proyecto                            |
| `fecha_fin`           | DATE      | Fecha fin del proyecto                               |
| `horario`             | TEXT      | Descripción del horario                              |
| `condiciones`         | TEXT      | Condiciones del trabajo                              |
| `certificado_digital` | TEXT      | URL del certificado (private-docs)                   |
| `created_at`          | TIMESTAMP |                                                      |

**Flujo de Estados:**

1. `pendiente` - Empresa solicita
2. `en_revision` - Empresa envía propuesta (PropuestaCondicionesModal)
3. `aprobada` - Universidad aprueba
4. `rechazada` - Universidad rechaza
5. `cerrada` - Proyecto finalizado

---

### Tabla 10: `entrevistas` - Registro de Entrevistas Programadas

**Propósito:** Seguimiento de entrevistas  
**Relaciones:**

- N-1 con aplicaciones
- N-1 con empresas

| Campo            | Tipo      | Propósito                                      |
| ---------------- | --------- | ---------------------------------------------- |
| `id`             | UUID      | PK                                             |
| `aplicacion_id`  | UUID      | FK aplicaciones                                |
| `empresa_id`     | UUID      | FK empresas                                    |
| `solicitante_id` | UUID      | FK talentos/alumnos                            |
| `fecha`          | DATE      | Fecha de entrevista                            |
| `hora`           | TIME      | Hora de entrevista                             |
| `modalidad`      | TEXT      | virtual\|presencial                            |
| `lugar`          | TEXT      | Ubicación (si presencial)                      |
| `notas`          | TEXT      | Notas adicionales                              |
| `estado`         | TEXT      | programada\|realizada\|cancelada\|reprogramada |
| `created_at`     | TIMESTAMP |                                                |

---

### Tabla 11: `notificaciones` - Sistema de Alertas Global

**Propósito:** Notificaciones para todos los usuarios  
**Relación:** N-1 con profiles

| Campo        | Tipo      | Propósito                                                |
| ------------ | --------- | -------------------------------------------------------- |
| `id`         | UUID      | PK                                                       |
| `usuario_id` | UUID      | FK profiles                                              |
| `tipo`       | TEXT      | entrevista\|horas_sociales\|aplicacion\|mensaje\|sistema |
| `titulo`     | TEXT      | Título de notificación                                   |
| `mensaje`    | TEXT      | Cuerpo del mensaje                                       |
| `leida`      | BOOLEAN   | ¿Ya vista?                                               |
| `data_ref`   | JSONB     | Datos contextuales (FK a recurso relacionado)            |
| `fecha`      | TIMESTAMP | DEFAULT NOW()                                            |

**Triggers automáticos:**

- Nueva entrevista agendada (AgendarEntrevistaModal)
- Propuesta de condiciones recibida (PropuestaCondicionesModal)
- Aplicación rechazada (RechazarModal)
- Solicitud de horas nueva

---

### Tabla 12: `suscripciones_empresas` - Gestión de Planes

**Propósito:** Control de plan y límites de empresa  
**Relación:** 1-1 con empresas (UNIQUE FK)

| Campo            | Tipo    | Propósito                    |
| ---------------- | ------- | ---------------------------- |
| `id`             | UUID    | PK                           |
| `empresa_id`     | UUID    | UNIQUE FK empresas           |
| `plan`           | TEXT    | basico\|profesional\|premium |
| `max_vacantes`   | INT     | 3\|10\|50 según plan         |
| `estado`         | TEXT    | activa\|cancelada\|vencida   |
| `fecha_inicio`   | DATE    | Inicio suscripción           |
| `fecha_fin`      | DATE    | Vencimiento                  |
| `precio_mensual` | DECIMAL | Precio del plan              |
| `es_prueba`      | BOOLEAN | ¿Es período de prueba?       |

**Validación en código:**

```typescript
// En dashboard-empresa.tsx
const { activas, limite, plan } = await getPlanInfo(empresaId);
if (activas >= limite) {
  showUpgradePlan = true;
}
```

---

## 2.3 Relaciones de Base de Datos (Esquema de Claves Foráneas)

### Cascada de Eliminación

```
auth.users (DELETE)
  └→ CASCADE
    ├─ profiles (borra id)
    ├─ talentos (si owner_id)
    ├─ empresas (si owner_id)
    └─ universidades (si owner_id)

profiles (DELETE)
  └→ CASCADE
    ├─ notificaciones (usuario_id)
    └─ Campos en otras tablas se ponen NULL si no está configurado CASCADE
```

### Restricciones de Integridad

| Relación                         | Tipo       | Impacto                         |
| -------------------------------- | ---------- | ------------------------------- |
| empresa → suscripciones_empresas | 1-1 UNIQUE | Solo 1 suscripción por empresa  |
| vacante → aplicaciones           | 1-N        | Muchas aplicaciones por vacante |
| grupo → solicitudes_horas        | 1-N        | Múltiples solicitudes por grupo |
| empresa → solicitudes_horas      | 1-N        | Empresa puede solicitar varias  |

---

# 📁 PARTE 3: ARCHIVOS TSX - ANÁLISIS DETALLADO

## 3.1 Estructura de Carpetas

```
app/
├─ _layout.tsx (Router principal)
├─ iniciosesion.tsx (Login)
├─ registro.tsx (Signup multi-flow)
├─ modal.tsx (Modal de ruta)
├─ dashboard-admin.tsx (Admin panel)
├─ dashboard-empresa.tsx (Employer portal)
├─ dashboard-estudiante.tsx (Student portal)
├─ dashboard-universidad.tsx (University portal)
├─ dashboard-joventalento.tsx (Talent portal)
├─ (tabs)/
│  ├─ _layout.tsx (Tabs router)
│  ├─ index.tsx (Home inicial)
│  └─ explore.tsx (Explorador)
└─ admin/
   ├─ _layout.tsx
   └─ index.tsx

components/
├─ AgendarEntrevistaModal.tsx (Modal para entrevistas)
├─ PropuestaCondicionesModal.tsx (Modal horas sociales)
├─ BuscadorExplorador.tsx (Búsqueda reutilizable)
├─ CambiarPasswordModal.tsx (Cambio contraseña)
├─ RechazarModal.tsx (Rechazar candidatos)
├─ UpgradePlanModal.tsx (Upgrade de plan)
├─ AppHeader.tsx (Header app)
├─ external-link.tsx (Link externo)
├─ ParallaxScrollView.tsx (Scroll parallax)
├─ TranslatedText.tsx (Texto traducido)
├─ InputValidado.tsx (Input con validación)
├─ PerfilPublicoModal.tsx (Perfil público)
└─ ui/
   ├─ collapsible.tsx
   └─ icon-symbol.tsx

src/
├─ components/
│  ├─ UniversalHeader.tsx (Header universal)
│  ├─ GroupCreationModal.tsx (Crear grupos)
│  ├─ GroupDetailModal.tsx (Detalles grupo)
│  ├─ ProfileViewerModal.tsx (Visor de perfil)
│  └─ ProfileViewer.tsx (Componente perfil)
├─ context/
│  ├─ ThemeContext.tsx (Tema oscuro/claro)
│  └─ TranslationContext.tsx (i18n)
├─ locales/
│  ├─ es.json
│  ├─ en.json
│  ├─ pt.json
│  └─ zh.json
└─ services/
   ├─ authService.ts
   └─ translationService.ts

services/
├─ authService.ts (Autenticación principal)
└─ storageService.ts (Subida de archivos)

utils/
└─ supabase-helpers.ts (Funciones reutilizables)

lib/
├─ supabase.ts (Cliente Supabase)
├─ supabaseAdmin.ts (Cliente admin)
└─ (supabase legado en config/)
```

---

## 3.2 Archivo por Archivo - Análisis Exhaustivo

### 1️⃣ `app/_layout.tsx` - ROUTER PRINCIPAL

**Propósito:** Punto de entrada, define estructura de navegación global  
**Componentes principales:**

- Stack.Screen para cada ruta principal
- Proveedores de contexto (ThemeProvider, TranslationProvider, ThemeProvider de React Navigation)

**Rutas definidas:**

```typescript
Stack.Screen name="(tabs)" - Home con pestañas
Stack.Screen name="iniciosesion" - Página de login
Stack.Screen name="registro" - Página de signup
Stack.Screen name="dashboard-admin" - Panel admin
Stack.Screen name="dashboard-empresa" - Portal empresa
Stack.Screen name="dashboard-joventalento" - Portal talento
Stack.Screen name="dashboard-estudiante" - Portal alumno
Stack.Screen name="dashboard-universidad" - Portal universidad
Stack.Screen name="modal" - Modal presentation
```

**Conexión BD:** Ninguna (es solo routing)  
**Elementos UI:**

- Topbar: StatusBar
- Tema: DarkTheme | DefaultTheme
- Contextos envolventes

**Problemas Identificados:**

- ✅ Todo correcto, estructura limpia

---

### 2️⃣ `app/iniciosesion.tsx` - LOGIN

**Propósito:** Autenticación de usuarios existentes  
**Tamaño:** ~1200+ líneas  
**Flujo principal:**

#### Paso 1: Credenciales

```
Input: Email/Username ────────┐
Input: Password ──────────────┤→ Validación
Botón: "Iniciar Sesión" ──────┘
  ↓
loginUser(emailOrUsername, password)
```

#### Paso 2: 2FA/OTP (Opcional - Recuperación)

```
Si recuperación de contraseña activada:
  ↓
Input: Email de recuperación
Botón: "Enviar código"
  ↓
Modal OTP aparece (8 campos)
  ├─ Timer: 10 min validez OTP
  ├─ Botón: "Resend" (cada 60s)
  └─ Tiempo restante visualizado
  ↓
Ingresa OTP
  ↓
Botón: "Verificar"
```

#### Paso 3: Nueva Contraseña

```
Input: Contraseña nueva
Input: Confirmar contraseña
Botón: "Cambiar Contraseña"
  ↓
supabase.auth.updateUser({password: newPassword})
```

**Conexión BD:**

- `supabase.auth.signInWithPassword(email, password)` - Autenticación
- `resolveEmailFromUsername(emailOrUsername)` - Si es username, busca email en:
  - `supabase.from("profiles").select("email").eq("username", normalized)`
  - `supabase.from("talentos").select("email").eq("username", normalized)`
  - `supabase.from("empresas").select("email_corporativo").eq("rep_username", normalized)`
- `supabase.auth.resetPasswordForEmail(email)` - OTP por email

**Elementos UI principales:**
| Elemento | Descripción |
|----------|-------------|
| Carousel | 6 imágenes girando cada 5s |
| Bullets | 3 puntos sobre características |
| Email Input | Con validación regex |
| Password Input | Con toggle ojo para mostrar/ocultar |
| Error Display | Mensajes de error bajo cada input |
| OTP Grid | 8 campos de 1 dígito |
| Timer | Cuenta regresiva OTP y resend |

**Estados del componente:**

```typescript
step: "credentials" | "2fa" | "recovery-email" | "recovery-otp" | "recovery-password"
emailOrUsername: string
password: string
showPassword: boolean
userError: string
passError: string
globalError: string
otp: string[] (8 elementos)
otpError: boolean
otpSuccess: boolean
otpSeconds: number (máx 600 = 10 min)
resendSeconds: number (máx 60)
loginRole: string
```

**Redirección post-login:**

```typescript
const role = authData.user.user_metadata?.role ?? "talento";
switch (role) {
  case "admin":
    return "/dashboard-admin";
  case "universidad":
    return "/dashboard-universidad";
  case "empresa":
    return "/dashboard-empresa";
  case "alumno":
    return "/dashboard-estudiante";
  case "talento":
    return "/dashboard-joventalento";
  default:
    return "/(tabs)";
}
```

**Problemas Identificados:**

- ⚠️ OTP está hardcoded pero email NO se envía automáticamente
- ⚠️ Validación de email débil (regex no estricto)
- ✅ Manejo de errores de red bueno

---

### 3️⃣ `app/registro.tsx` - SIGNUP MULTI-FLUJO

**Propósito:** Registro de nuevos usuarios (3 tipos)  
**Tamaño:** ~3000+ líneas  
**Flujos:**

#### FLUJO 1: JOVEN TALENTO (5 pasos)

**Paso 1/5 - Datos Básicos:**

```
├─ Email input + validation
├─ Password input (mín 8 chars, 1 mayúscula, 1 número)
├─ Nombre input
├─ Username input (única, 3-20 chars)
├─ Teléfono input
├─ Selector: Departamento (14 opciones El Salvador)
├─ Selector: Ciudad (dinámico según departamento)
└─ Botón: "Siguiente"
```

**Paso 2/5 - Identidad:**

```
├─ Radio: Tipo documento (DUI|Pasaporte|Licencia)
├─ Input: Número documento
├─ Selector: Universidad (lista preestablecida)
├─ Selector: Área (AREAS array - 25 opciones)
└─ Botón: "Siguiente"
```

**Paso 3/5 - Perfil:**

```
├─ TextArea: Bio (500 chars max)
├─ TextArea: Habilidades
├─ Multi-select: Idiomas (lista IDIOMAS)
│   └─ Para cada idioma: Dropdown nivel (A1-C2)
├─ Input: Instagram (opcional)
├─ Input: LinkedIn (opcional)
├─ Input: GitHub (opcional)
├─ Input: TikTok (opcional)
├─ Input: Behance (opcional)
└─ Botón: "Siguiente"
```

**Paso 4/5 - Pago:**

```
├─ Input: Número tarjeta (16 dígitos)
├─ Input: Expiración (MM/YY)
├─ Input: CVV (3 dígitos)
├─ Checkbox: "Guardar para futuras compras" (opcional)
└─ Botón: "Siguiente"
```

**Paso 5/5 - Seguridad (Confirmación):**

```
├─ Resumen de datos ingresados
├─ Checkbox: "Acepto términos y condiciones"
├─ Checkbox: "Acepto política de privacidad"
└─ Botón: "Registrarse"
```

**Conexión BD (registerTalento):**

```typescript
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { role: "talento" },
  },
});

await supabase.from("profiles").insert({
  id: userId,
  email,
  username,
  role: "talento",
  nombre,
  telefono,
  departamento,
  ciudad,
  bio,
  habilidades,
  idiomas: JSON.stringify(idiomas),
  doc_tipo: docTipo,
  doc_numero: docNumero,
  universidad,
  area,
});

await supabase.from("talentos").insert({
  profile_id: userId,
  email,
  nombre,
  username,
  telefono,
  departamento,
  ciudad,
  bio,
  habilidades,
  idiomas: JSON.stringify(idiomas),
  doc_tipo: docTipo,
  doc_numero: docNumero,
  universidad,
  area,
  instagram,
  linkedin,
  github,
  tiktok,
  behance,
  status: "active",
});

// Subir fotos si existen
if (fotoDocUri) {
  await uploadImageIfExists(
    fotoDocUri,
    "private-docs",
    `docs/talento/${userId}/dui`,
  );
}

if (fotoPerfilUri) {
  const publicUrl = await uploadImageIfExists(
    fotoPerfilUri,
    "public-media",
    `profiles/talento/${userId}/foto`,
  );
  await supabase
    .from("talentos")
    .update({ foto_perfil: publicUrl })
    .eq("id", userId);
}
```

**Estado del componente (Talento):**

```typescript
flow: "talento" | "empresa" | "universidad" | null;
step: 1 | 2 | 3 | 4 | 5;

// Paso 1
email: string;
password: string;
nombre: string;
username: string;
telefono: string;
departamento: string;
ciudad: string;

// Paso 2
docType: "dui" | "pasaporte" | "licencia";
docNumero: string;
universidad: string;
area: string;

// Paso 3
bio: string;
habilidades: string;
idiomas: {
  (name, level);
}
[];
instagram: string;
linkedin: string;
github: string;
tiktok: string;
behance: string;

// Paso 4
cardNum: string;
cardExp: string;
cardCvv: string;

// General
saving: boolean;
errors: Record<string, string>;
```

---

#### FLUJO 2: EMPRESA (5 pasos)

**Paso 1/5 - Datos Empresa:**

```
├─ Input: Nombre empresa
├─ Selector: Industria (INDUSTRIAS array - 11 opciones)
├─ TextArea: Descripción (500 chars)
├─ Selector: Departamento
├─ Selector: Ciudad
├─ Input: Dirección (opcional)
├─ Input: Teléfono empresa
├─ Input: Email corporativo
├─ Input: Sitio web (opcional)
└─ Botón: "Siguiente"
```

**Paso 2/5 - Visual:**

```
├─ Image picker: Logo (recomendado 1:1)
├─ Image picker: Banner (recomendado 16:9)
└─ Botón: "Siguiente"
```

**Paso 3/5 - Antifraude:**

```
├─ Input: Nombre representante legal
├─ Input: Cargo
├─ Input: Email
├─ Input: Teléfono
├─ Input: DUI/Cédula
├─ Image picker: Foto DUI
├─ Image picker: Selfie con documento
└─ Botón: "Siguiente"
```

**Paso 4/5 - Plan de Facturación:**

```
├─ Radio cards: Plan (Básico|Profesional|Premium)
│   ├─ Básico: 3 vacantes, $X/mes
│   ├─ Profesional: 10 vacantes, $Y/mes
│   └─ Premium: 50 vacantes, $Z/mes
├─ Input: Número tarjeta
├─ Input: Expiración (MM/YY)
├─ Input: CVV
└─ Botón: "Siguiente"
```

**Paso 5/5 - Representante (Confirmación):**

```
├─ Resumen de datos
├─ Datos del representante
├─ Checkbox: Aceptar términos
└─ Botón: "Crear Empresa"
```

**Conexión BD (registerEmpresa):**

```typescript
await supabase.auth.signUp({
  email: repEmail,
  password,
  options: { data: { role: 'empresa' } }
});

await supabase.from("profiles").insert({
  id: userId,
  email: repEmail,
  username,
  role: 'empresa',
  nombre: repNombre
});

await supabase.from("empresas").insert({
  owner_id: userId,
  nombre,
  industria,
  descripcion,
  departamento,
  ciudad,
  direccion,
  telefono,
  email_corporativo,
  web,
  rep_nombre,
  rep_cargo,
  rep_email,
  rep_telefono,
  rep_dui,
  status: 'active'
});

await supabase.from("suscripciones_empresas").insert({
  empresa_id: empresaId,
  plan: planSeleccionado,
  max_vacantes: plan === 'basico' ? 3 : plan === 'profesional' ? 10 : 50,
  estado: 'activa',
  fecha_inicio: NOW(),
  fecha_fin: NOW() + 30 days,
  precio_mensual: precio
});

// Subir imágenes
await uploadImageIfExists(fotoLogoUri, "public-media", `logos/empresa/${empresaId}`);
await uploadImageIfExists(fotoBannerUri, "public-media", `banners/empresa/${empresaId}`);
await uploadImageIfExists(fotoRepDuiUri, "private-docs", `docs/empresa/${empresaId}/dui`);
await uploadImageIfExists(fotoRepSelfieUri, "private-docs", `docs/empresa/${empresaId}/selfie`);
```

---

#### FLUJO 3: UNIVERSIDAD (5 pasos)

**Paso 1/5 - Institución:**

```
├─ Input: Nombre universidad
├─ Selector: Departamento
├─ Selector: Ciudad
├─ Input: Dirección (opcional)
├─ Input: Email institucional
├─ Input: Teléfono
├─ TextArea: Descripción (opcional)
├─ Input: Sitio web (opcional)
├─ Input: Instagram (opcional)
├─ Input: TikTok (opcional)
├─ Input: GitHub (opcional)
├─ Input: Behance (opcional)
└─ Botón: "Siguiente"
```

**Paso 2/5 - Visual:**

```
├─ Image picker: Logo
├─ Image picker: Banner
├─ Label: "Documentos del Rector" (informativo)
└─ Botón: "Siguiente"
```

**Paso 3/5 - Antifraude (Rector y Encargado):**

```
├─ Rector:
│  ├─ Input: Nombre
│  ├─ Radio: Tipo documento
│  ├─ Input: Número documento
│  ├─ Image picker: Foto DUI
│  └─ Image picker: Selfie
│
├─ Encargado Académico:
│  ├─ Input: Nombre
│  ├─ Input: Teléfono
│  ├─ Input: Email
│  ├─ Input: Instagram (opcional)
│  └─ Input: LinkedIn (opcional)
│
└─ Botón: "Siguiente"
```

**Paso 4/5 - Carreras:**

```
├─ Multi-add: Para cada carrera:
│  ├─ Input: Nombre carrera
│  ├─ Selector: Duración (2-8 años)
│  ├─ Selector: Modalidad (Presencial|Virtual|Híbrida)
│  ├─ Input: Coordinador
│  └─ Botón: "+ Agregar carrera" | "- Eliminar"
│
└─ Botón: "Siguiente"
```

**Paso 5/5 - Responsable (Confirmación):**

```
├─ Resumen de datos
├─ Encargado de educación continua
├─ Checkbox: Aceptar términos
└─ Botón: "Crear Universidad"
```

**Conexión BD (registerUniversidad):**

```typescript
await supabase.auth.signUp({
  email: encEmail,
  password,
  options: { data: { role: 'universidad' } }
});

await supabase.from("profiles").insert({...});

await supabase.from("universidades").insert({
  owner_id: userId,
  nombre,
  departamento,
  ciudad,
  email_institucional,
  rector_nombre,
  rector_doc_tipo,
  rector_doc_numero,
  enc_nombre,
  enc_telefono,
  enc_email,
  status: 'active'
});

// Insertar carreras
for (const carrera of carreras) {
  await supabase.from("carreras").insert({
    universidad_id: universidadId,
    nombre: carrera.nombre,
    duracion: carrera.duracion,
    modalidad: carrera.modalidad,
    coordinador: carrera.coordinador
  });
}
```

---

### 4️⃣ `app/dashboard-empresa.tsx` - PORTAL EMPLOYER

**Propósito:** Gestión completa de empresa (vacantes, candidatos, horas)  
**Tamaño:** ~2500+ líneas  
**Roles de uso:** Empresa

#### Bottom Navigation (5 tabs)

```
┌─────────────────────────────────────────────────────┐
│  Inicio  │  Vacantes  │  Candidatos  │  Horas  │ Perfil │
└─────────────────────────────────────────────────────┘
```

#### TAB 1: INICIO (KPIs)

**Componentes:**

- Card: "Vacantes activas" → Número de vacantes con estado 'activa'
- Card: "Total candidatos" → COUNT de aplicaciones pendientes + en revisión
- Card: "Horas sociales" → COUNT de solicitudes_horas pendientes
- Card: "Evaluaciones" → COUNT de entrevistas pendientes

**Conexión BD:**

```typescript
const [metVacantes, setMetVacantes] = useState(0);
const [metCandidatos, setMetCandidatos] = useState(0);
const [metHoras, setMetHoras] = useState(0);
const [metEvaluaciones, setMetEvaluaciones] = useState(0);

useEffect(() => {
  async function loadMetrics() {
    const { count: c1 } = await supabase
      .from("vacantes")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("estado", "activa");

    const { count: c2 } = await supabase
      .from("aplicaciones")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .in("estado", ["pendiente", "en_revision"]);

    // ... más queries

    setMetVacantes(c1 ?? 0);
    setMetCandidatos(c2 ?? 0);
    // ...
  }
  loadMetrics();
}, [empresaId]);
```

---

#### TAB 2: VACANTES

**Estado:**

```typescript
const [vacantes, setVacantes] = useState<Vacante[]>([]);
const [showVacanteModal, setShowVacanteModal] = useState(false);
const [vacanteStep, setVacanteStep] = useState<1 | 2 | 3>(1);
const [formTitulo, setFormTitulo] = useState("");
const [formArea, setFormArea] = useState("");
const [formModalidad, setFormModalidad] = useState("presencial");
const [formTipo, setFormTipo] = useState("tiempo_completo");
const [formDesc, setFormDesc] = useState("");
const [formSalMin, setFormSalMin] = useState("");
const [formSalMax, setFormSalMax] = useState("");
const [formMostrarSal, setFormMostrarSal] = useState(false);
const [formAplicaHoras, setFormAplicaHoras] = useState(false);
const [showUpgradePlan, setShowUpgradePlan] = useState(false);
const [planActual, setPlanActual] = useState<string>("basico");
const [planLimite, setPlanLimite] = useState<number>(3);
const [savingVacante, setSavingVacante] = useState(false);
```

**UI:**

- Tabla de vacantes: [Título | Aplicantes | Modalidad | Estado]
- Botón "+ Nueva Vacante" → Modal 3 pasos
  - Paso 1: Datos básicos
  - Paso 2: Salario
  - Paso 3: Horas sociales
- Acciones por vacante: Editar, Cambiar estado, Ver aplicantes, Eliminar

**Validación de Plan:**

```typescript
// Antes de permitir guardar vacante
const { activas, limite } = await getPlanInfo(empresaId);
if (activas >= limite) {
  showUpgradePlan = true;
  // Mostrar UpgradePlanModal
  return;
}

// Guardar vacante
await supabase.from("vacantes").insert({
  empresa_id: empresaId,
  titulo: formTitulo,
  area: formArea,
  modalidad: formModalidad,
  tipo: formTipo,
  descripcion: formDesc,
  salario_min: parseInt(formSalMin),
  salario_max: parseInt(formSalMax),
  mostrar_salario: formMostrarSal,
  aplica_horas_sociales: formAplicaHoras,
  estado: "activa",
  created_at: NOW(),
});
```

---

#### TAB 3: CANDIDATOS (KANBAN)

**Estructura Kanban:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Pendiente │ En revisión │ Entrevista │ Contratada │ Rechazada   │
│ (amarillo)│  (púrpura)  │   (azul)   │  (verde)   │   (rojo)    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────┐  │   ┌─────┐  │  ┌─────┐  │  ┌─────┐  │  ┌─────┐    │
│  │Card1│  │   │Card2│  │  │Card3│  │  │Card4│  │  │Card5│    │
│  │     │  │   │     │  │  │     │  │  │     │  │  │     │    │
│  └─────┘  │   └─────┘  │  └─────┘  │  └─────┘  │  └─────┘    │
│           │           │           │           │             │
│  ┌─────┐  │   ┌─────┐  │           │           │             │
│  │Card6│  │   │Card7│  │           │           │             │
│  └─────┘  │   └─────┘  │           │           │             │
└─────────────────────────────────────────────────────────────────┘
```

**Card de candidato:**

```
┌──────────────────────────────┐
│ [Foto] Nombre                │
│ Vacante: "Dev Senior"        │
│ Aplicó: 15 mayo              │
│ [Agendar] [Rechazar]         │
└──────────────────────────────┘
```

**Acciones:**

- Botón "Agendar entrevista" → AgendarEntrevistaModal
  - Input: Fecha
  - Input: Hora
  - Radio: Modalidad (Virtual/Presencial)
  - Input: Lugar
  - Input: Notas
  - Al enviar:
    - Actualiza `aplicaciones.estado = 'entrevista'`
    - Inserta en `entrevistas`
    - Crea notificación al candidato
    - Card se mueve a columna "Entrevista"

- Botón "Rechazar" → RechazarModal
  - Input: Motivo rechazo
  - Al enviar:
    - Actualiza `aplicaciones.estado = 'rechazada'`
    - Envía notificación
    - Card se mueve a columna "Rechazada"

- Botón "Contratar" (si en Entrevista):
  - Actualiza `aplicaciones.estado = 'contratada'`
  - Crea notificación al candidato

**Conexión BD:**

```typescript
const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
const [kanbanTab, setKanbanTab] = useState("pendiente");

useEffect(() => {
  async function loadAplicaciones() {
    const { data } = await supabase
      .from("aplicaciones")
      .select("*, vacante:vacantes(*), talento:talentos(*)")
      .eq("empresa_id", empresaId)
      .order("fecha_aplicacion", { ascending: false });

    setAplicaciones(data ?? []);
  }
  loadAplicaciones();
}, [empresaId]);

// Agendar entrevista
async function handleAgendarEntrevista(fecha, hora, modalidad, lugar, notas) {
  await supabase
    .from("aplicaciones")
    .update({ estado: "entrevista" })
    .eq("id", selectedAplicacion.id);

  await supabase.from("entrevistas").insert({
    aplicacion_id: selectedAplicacion.id,
    empresa_id: empresaId,
    solicitante_id: selectedAplicacion.talento_id,
    fecha,
    hora,
    modalidad,
    lugar,
    notas,
    estado: "programada",
  });

  await supabase.from("notificaciones").insert({
    usuario_id: selectedAplicacion.talento_id,
    tipo: "entrevista",
    titulo: "Entrevista programada",
    mensaje: `Tienes entrevista para "${selectedAplicacion.vacante.titulo}" el ${fecha} a las ${hora}`,
    leida: false,
  });

  setAplicaciones((prev) =>
    prev.map((app) =>
      app.id === selectedAplicacion.id ? { ...app, estado: "entrevista" } : app,
    ),
  );
}
```

---

#### TAB 4: HORAS SOCIALES

**Tabs por estado:**

```
Pendiente │ En revisión │ Aprobada │ Rechazada │ Cerrada
```

**Para cada solicitud:**

- Información: Grupo, Universidad, Horas solicitadas
- Botón "Enviar propuesta" → PropuestaCondicionesModal
  - Input: Horas ofrecidas
  - Input: Fecha inicio
  - Input: Fecha fin
  - Input: Horario
  - TextArea: Condiciones
  - Al enviar:
    - Actualiza `solicitudes_horas.estado = 'en_revision'`
    - Guarda propuesta (horas_ofrecidas, fecha_inicio, fecha_fin, etc.)
    - Notifica a universidad

- Botón "Evaluar" → Modal de evaluación
  - Slider 1-5: Puntualidad
  - Slider 1-5: Disciplina
  - Slider 1-5: Responsabilidad
  - Slider 1-5: Respeto
  - Slider 1-5: Desempeño
  - TextArea: Comentario general
  - Botón "Guardar evaluación"
    - Inserta en tabla `evaluaciones` (si existe)

**Conexión BD:**

```typescript
const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);

useEffect(() => {
  async function loadSolicitudes() {
    const { data } = await supabase
      .from("solicitudes_horas")
      .select("*, grupo:grupos(*), universidad:universidades(*)")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });

    setSolicitudes(data ?? []);
  }
  loadSolicitudes();
}, [empresaId]);
```

---

#### TAB 5: MI PERFIL

**Modo Vista:**

- Foto de empresa (logo)
- Nombre empresa
- Industria
- Descripción
- Teléfono, Email corporativo
- Ubicación (Depto, Ciudad)
- Datos representante legal
- Botón "Editar" → Cambia a modo edición
- Botón "Cambiar Contraseña" → CambiarPasswordModal
- Botón "Acerca de Gradly"
- Botón "Ayuda"
- Botón "Cerrar Sesión"

**Modo Edición:**

- TextInput editable para: Nombre, Descripción, Teléfono, Email, Web, Instagram, Facebook
- Botón para cambiar logo/banner (ImagePicker)
- Datos representante (solo lectura o editable)
- Botón "Guardar" → Actualiza campos en tabla `empresas`
- Botón "Cancelar" → Vuelve a modo vista

**Conexión BD:**

```typescript
const [empresa, setEmpresa] = useState<EmpresaData | null>(null);
const [perfilMode, setPerfilMode] = useState<"view" | "edit">("view");
const [editNombre, setEditNombre] = useState("");
// ... más campos de edición

useEffect(() => {
  async function loadEmpresa() {
    const { data } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", empresaId)
      .single();

    setEmpresa(data);
    setEditNombre(data?.nombre ?? "");
    // ... más campos
  }
  loadEmpresa();
}, [empresaId]);

async function handleSaveProfile() {
  setSavingPerfil(true);
  try {
    await supabase
      .from("empresas")
      .update({
        nombre: editNombre,
        descripcion: editDesc,
        telefono: editTel,
        // ... otros campos
      })
      .eq("id", empresaId);

    setPerfilMode("view");
    Alert.alert("Éxito", "Perfil actualizado");
  } finally {
    setSavingPerfil(false);
  }
}
```

---

### 5️⃣ `app/dashboard-universidad.tsx` - PORTAL UNIVERSITY

**Propósito:** Gestión de institución, grupos, horas sociales  
**Tamaño:** ~2000+ líneas

#### Secciones principales

**Inicio:**

- Información de universidad
- Últimos grupos creados
- Próximas actividades

**Explorar:**

- Sub-tab "Empresas": Listado de empresas aliadas
- Sub-tab "Universidades": Otras universidades en plataforma
- Sub-tab "Proyectos": Proyectos disponibles
- Buscador: BuscadorExplorador

**Grupos:**

- Tabla/Listado de grupos
- Botón "+ Crear grupo" → GroupCreationModal
  - Input: Nombre grupo
  - TextArea: Descripción
  - Input: Horas requeridas
  - Selector: Profesor responsable
  - Botón "Crear"
    - Inserta en `grupos` con `universidad_id = user.id`
    - Llama `loadGruposAutenticado()`

- Para cada grupo:
  - Card con: Nombre, Estado, Estudiantes, Botón "Ver grupo"
  - Botón "Ver grupo" → GroupDetailModal
    - Muestra detalles del grupo
    - Lista estudiantes
    - Muestra solicitudes asociadas

**Función Especial: `loadGruposAutenticado()`**

```typescript
const loadGruposAutenticado = async () => {
  try {
    // 1. Obtener usuario autenticado
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    // 2. Obtener grupos de la universidad
    const { data: gruposDb, error: errGrupos } = await supabase
      .from("grupos")
      .select("*")
      .eq("universidad_id", user.id)
      .order("fecha_creacion", { ascending: false });

    if (errGrupos) throw errGrupos;

    // 3. Para cada grupo, obtener información relacionada
    const gruposData = await Promise.all(
      (gruposDb ?? []).map(async (grupo) => {
        // 3a. Contar estudiantes
        const { count: numEstudiantes } = await supabase
          .from("estudiantes") // o relación N-M
          .select("*", { count: "exact", head: true })
          .eq("grupo_id", grupo.id);

        // 3b. Obtener solicitud de horas más reciente
        const { data: solicitudData } = await supabase
          .from("solicitudes_horas")
          .select("*, empresa:empresas(nombre)")
          .eq("grupo_id", grupo.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // 3c. Mapear estado
        const estadoMap = {
          activo: { status: "Activo", badgeType: "active" },
          pausado: { status: "Pausado", badgeType: "warning" },
          completado: { status: "Completado", badgeType: "success" },
        };

        return {
          id: grupo.id,
          name: grupo.nombre,
          status: estadoMap[grupo.estado]?.status ?? "Activo",
          badgeType: estadoMap[grupo.estado]?.badgeType ?? "info",
          students: numEstudiantes ?? 0,
          hoursRequired: grupo.horas_requeridas,
          empresa: solicitudData?.empresa?.nombre ?? "No asignada",
          tags: [
            grupo.estado,
            `${numEstudiantes ?? 0} estudiantes`,
            `${grupo.horas_requeridas} horas`,
          ],
        };
      }),
    );

    setGrupos(gruposData);
  } catch (error) {
    console.error("Error en loadGruposAutenticado:", error);
    Alert.alert("Error", "No se pudieron cargar los grupos");
  }
};

// Se ejecuta cuando: section === "grupos" || section === "gestion"
useEffect(() => {
  if (section === "grupos" || section === "gestion") {
    loadGruposDb();
    loadGruposAutenticado(); // ← NUEVA LÍNEA
  }
}, [section]);
```

**Relación con BD:**

```
universidad_id (user.id)
  ↓
  [Universidad encontrada]
  ├─ SELECT * FROM grupos WHERE universidad_id = user.id
  │   ├─ Para cada grupo_id:
  │   │   ├─ COUNT estudiantes
  │   │   └─ SELECT solicitudes_horas + empresa data
  │   └─ Mapear estados + crear tags
  └─ setGrupos(mapped_data)
```

**Horas Sociales:**

- Tabs: Pendiente | En revisión | Aprobada | Rechazada | Cerrada
- Para cada solicitud:
  - Información: Empresa, Grupo, Horas, Estado
  - Botones: Revisar, Aprobar, Rechazar
  - Actualiza `solicitudes_horas.estado`

**Perfil:**

- Datos institucionales (logo, nombre, etc.)
- Lista de carreras
- Botón "Editar carreras"
- Fotos institucionales

---

### 6️⃣ `app/dashboard-estudiante.tsx` - PORTAL STUDENT

**Propósito:** Portal académico para alumnos  
**Bottom Nav:** Home | Explorar | Cursos | Mi Perfil

**Home:**

- Información del alumno
- Progreso de horas sociales (visual)
- Próximas convocatorias

**Explorar:**

- Sub-tab "Empresas": Listado con filtro
- Sub-tab "Proyectos": Proyectos disponibles

**Cursos:**

- Sub-tab "Lista": Tabla de cursos
- Sub-tab "Horario": Horario semanal/mensual

**Mi Perfil:**

- Foto de perfil (editor)
- Datos personales
- Carrera y semester
- Sub-sección "Pagos"
- Botones: Editar, Cambiar contraseña, Cerrar sesión

**Conexión BD:**

- `alumnos` - Datos del alumno
- `universidades` - Información de institución
- `cursos` - Cursos matriculados
- `solicitudes_horas` - Horas sociales

---

### 7️⃣ `app/dashboard-joventalento.tsx` - PORTAL TALENT

**Propósito:** Portal para jóvenes profesionales independientes  
**Bottom Nav:** Home | Mis Proyectos | Pagos | Mi Perfil

**Home:**

- Card con datos del talento
- Búsqueda de vacantes con filtro por modalidad
- Listado de vacantes recomendadas

**Mis Proyectos:**

- Listado de servicios/proyectos del talento
- Modal "+ Crear Nuevo Servicio" (3 pasos)
- Estado: Activo | Pausado | Borrador
- Metadatos: Categoría, modalidad, precio, calificación, contratos
- Botones: Editar, Eliminar

**Pagos:**

- Historial de pagos
- Estado: Pendiente | Completado

**Mi Perfil:**

- Foto de perfil
- Datos personales (editable)
- Educación: universidades y áreas
- Bio y habilidades
- Idiomas
- Redes sociales
- Sub-sección "Configuración"
- Sub-sección "Ayuda"
- Sub-sección "Acerca de"

**FAQ:**

- Preguntas sobre Gradly, validación de horas, planes, etc.

**Conexión BD:**

- `talentos` - Datos del talento
- `vacantes` - Búsqueda de oportunidades
- `aplicaciones` - Aplicaciones realizadas
- `servicios` - Proyectos/servicios

---

### 8️⃣ `app/dashboard-admin.tsx` - ADMIN PANEL

**Propósito:** Gestión administrativa del sistema  
**Páginas:** Resumen | Usuarios | Reportes | Ayuda | Config | Crear

**Resumen:**


- Total usuarios por rol (KPIs)
- Estado: Activo | Pendiente | Bloqueado

**Usuarios:**

- Tabla de TODOS los usuarios
- Filtro por rol (Talento, Universidad, Empresa, Alumno)
- Filtro por estado (Activo, Pendiente, Bloqueado)
- Búsqueda por nombre/email
- Acciones: Banear, Desbanear, Ver perfil, Cambiar rol

**Reportes:**

- Tabla de reportes de usuarios
- Estados: Pendiente, En revisión, Resuelto, Archivado

**Ayuda:**

- Mensajes de soporte
- Botón: Responder

**Config:**

- Configuraciones globales

**Crear:**

- Formulario para usuarios de prueba

**Conexión BD (useAdminData hook):**

```typescript
async function fetchUsers() {
  const [
    talentosResp,
    universidadesResp,
    empresasResp,
    alumnosResp,
    profilesResp,
  ] = await Promise.all([
    supabase.from("talentos").select("id,nombre,email,ciudad"),
    supabase
      .from("universidades")
      .select("id,nombre,email_institucional,ciudad"),
    supabase.from("empresas").select("id,nombre,email_corporativo,ciudad"),
    supabase.from("alumnos").select("id,nombre,email,ciudad"),
    supabase.from("profiles").select("id,email,status,nombre,role"),
  ]);

  // Mapear datos y crear índice de profiles
  const profiles = profilesResp.data ?? [];
  const profileIndex = new Map();
  profiles.forEach((p) => {
    if (p?.id) profileIndex.set(String(p.id), p);
    if (p?.email) profileIndex.set(String(p.email).toLowerCase(), p);
  });

  // Combinar datos
  const usersData = [
    ...mapUsers(talentosResp.data, "talento", "email"),
    ...mapUsers(universidadesResp.data, "universidad", "email_institucional"),
    ...mapUsers(empresasResp.data, "empresa", "email_corporativo"),
    ...mapUsers(alumnosResp.data, "alumno", "email"),
  ];

  setUsers(usersData);
}
```

---

## 3.3 Componentes Compartidos

### `components/AgendarEntrevistaModal.tsx`

**Props:**

```typescript
{
  visible: boolean,
  onClose: () => void,
  aplicacionId: string,
  solicitanteId: string,
  empresaId: string,
  vacanteId?: string,
  vacanteNombre?: string,
  solicitanteNombre?: string,
  theme?: "dark" | "light",
  onSuccess?: () => void
}
```

**Estado interno:**

```typescript
fecha: string (DD/MM/AAAA)
hora: string (HH:MM)
modalidad: "presencial" | "virtual"
lugar: string (para presencial)
notas: string
loading: boolean
```

**Acciones:**

1. Input: Fecha
2. Input: Hora
3. Radio: Modalidad (Virtual | Presencial)
4. Si Presencial:
   - Input: Lugar
5. TextArea: Notas (opcional)
6. Botón: "Agendar"
   - Validación: fecha y hora obligatorios
   - UPDATE `aplicaciones` SET estado = 'entrevista'
   - INSERT en `entrevistas`
   - INSERT en `notificaciones`
   - onSuccess callback

**Conexión BD:**

```typescript
await supabase
  .from("aplicaciones")
  .update({ estado: "entrevista" })
  .eq("id", aplicacionId);

await supabase.from("entrevistas").insert({
  aplicacion_id,
  empresa_id,
  solicitante_id,
  vacante_id,
  fecha,
  hora,
  modalidad,
  lugar,
  notas,
  estado: "programada",
});

await supabase.from("notificaciones").insert({
  usuario_id: solicitanteId,
  tipo: "entrevista",
  titulo: "Entrevista programada",
  mensaje: `...${fecha} a las ${hora}...`,
  leida: false,
});
```

---

### `components/PropuestaCondicionesModal.tsx`

**Props:**

```typescript
{
  visible: boolean,
  onClose: () => void,
  solicitudId: string,
  empresaId: string,
  universidadId: string,
  grupoNombre?: string,
  horasRequeridas?: number,
  theme?: "dark" | "light",
  onSuccess?: () => void
}
```

**Inputs:**

- TextInput: Horas ofrecidas (prefillada con horasRequeridas)
- TextInput: Fecha inicio (DD/MM/AAAA)
- TextInput: Fecha fin (DD/MM/AAAA)
- TextInput: Horario (descripción)
- TextArea: Condiciones (opcional)

**Conexión BD:**

```typescript
await supabase
  .from("solicitudes_horas")
  .update({
    estado: "en_revision",
    horas_ofrecidas: parseInt(horasOfrecidas),
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    horario,
    condiciones,
  })
  .eq("id", solicitudId);

await supabase.from("notificaciones").insert({
  usuario_id: universidadId,
  tipo: "horas_sociales",
  titulo: "Propuesta de condiciones recibida",
  mensaje: `...propuesta para grupo "${grupoNombre}"...`,
  leida: false,
});
```

---

### `src/components/GroupCreationModal.tsx`

**Inputs:**

- TextInput: Nombre grupo
- TextArea: Descripción
- NumberInput: Horas requeridas
- Selector: Profesor responsable

**Conexión BD:**

```typescript
await supabase.from("grupos").insert({
  universidad_id: user.id,
  nombre,
  descripcion,
  horas_requeridas: parseInt(horasRequeridas),
  profesor,
  estado: "activo",
  fecha_creacion: NOW(),
});
```

---

### `src/components/GroupDetailModal.tsx`

**Props:**

- `grupoId: string`
- `visible: boolean`
- `onClose: () => void`

**Contenido:**

- Información del grupo (nombre, estado, horas)
- Lista de estudiantes con checkbox
- Solicitudes asociadas
- Botones: Agregar estudiantes, Asignar empresa, Editar

**Conexión BD:**

- SELECT grupo
- SELECT estudiantes del grupo
- SELECT solicitudes_horas
- SELECT empresa datos

---

### `src/components/ProfileViewerModal.tsx`

**Contenido según rol:**

- **Talento:** Datos personales, educación, habilidades, portfolio, redes sociales
- **Empresa:** Datos empresa, representante, logo, redes
- **Universidad:** Datos institución, rector, encargado, carreras
- **Alumno:** Datos personales, carrera, progreso horas

**Conexión BD:** Queries dinámicas según rol del usuario

---

## 3.4 Contextos y Proveedores

### `src/context/ThemeContext.tsx`

**Estado:**

```typescript
interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
}
```

**Storage:** AsyncStorage con clave `"gradly_theme_preference"`

**Uso en componentes:**

```typescript
const { isDark } = useThemeContext();
const C = isDark ? darkTheme : lightTheme;
```

---

### `src/context/TranslationContext.tsx`

**Idiomas soportados:**

- ES (Español)
- EN (English)
- PT (Português)
- ZH (中文)

**Storage:** AsyncStorage con clave `"gradly_language"`

**Archivos:** `src/locales/{es,en,pt,zh}.json`

**Uso:**

```typescript
const Text = TranslatedText; // Componente que traduce automáticamente
<Text>home.welcome</Text> // Busca en locales/[idioma].json
```

---

## 3.5 Servicios

### `services/authService.ts`

**Funciones principales:**

1. **`registerTalento(data: TalentoData)`**
   - Crea auth.users
   - Inserta profiles + talentos
   - Sube imágenes
   - Retorna { user, session }

2. **`registerEmpresa(data: EmpresaData)`**
   - Similar pero para empresas
   - Crea suscripción automáticamente

3. **`registerUniversidad(data: UniversidadData)`**
   - Similar pero para universidades
   - Inserta carreras

4. **`loginUser(emailOrUsername, password)`**
   - Resuelve email si username
   - Autentica
   - Retorna { role: string }

5. **`resolveEmailFromUsername(username)`**
   - Busca en 3 tablas
   - Retorna email o null

---

### `services/storageService.ts`

1. **`pickAndUploadImage(bucket, path)`**
   - Abre ImagePicker
   - Sube a Storage
   - Retorna URL o ruta

2. **`getProfilePhotoUrl(userId, table)`**
   - SELECT foto_perfil
   - Retorna URL o null

3. **`updateProfilePhoto(userId, table, url)`**
   - UPDATE foto_perfil
   - Retorna boolean

4. **`updateUserProfile(userId, table, fields)`**
   - UPDATE campos genéricos
   - Retorna boolean

---

### `utils/supabase-helpers.ts`

**Funciones reutilizables:**

1. **`getRolData(userId, rol)`** → Obtiene datos por rol
2. **`checkBaneo(userId, rol)`** → Verifica ban
3. **`banearUsuario(userId, rol, profileId, motivo, hasta)`** → Banea
4. **`desbanearUsuario(userId, rol, profileId)`** → Desbanea
5. **`actualizarEstadoAplicacion(id, estado)`** → Cambia estado aplicación
6. **`actualizarEstadoSolicitudHoras(id, estado)`** → Cambia estado horas
7. **`getPlanInfo(empresaId)`** → Obtiene plan vigente
8. **`insertNotificacion(params)`** → Crea notificación

---

# 🔄 PARTE 4: FLUJOS DE DATOS (End-to-End)

## 4.1 Flujo: Nuevo Talento se Registra

```
┌──────────────────────────────────────────────────────────────────┐
│ app/registro.tsx → FLUJO TALENTO                                 │
└──────────────────────────────────────────────────────────────────┘
       ↓
   Step 1: Datos básicos
   ├─ email: user@example.com
   ├─ password: Segura123!
   ├─ nombre: Juan Pérez
   ├─ username: juanperez
   └─ ...geo data
       ↓
   Step 2: Identidad
   ├─ doc_tipo: "dui"
   ├─ doc_numero: "12345678-9"
   ├─ universidad: "Universidad X"
   └─ area: "Ingeniería en Sistemas"
       ↓
   Step 3: Perfil
   ├─ bio: "Desarrollador con 2 años de experiencia"
   ├─ habilidades: "React, Node.js, SQL"
   ├─ idiomas: [{name: "English", level: "B2"}]
   └─ redes sociales
       ↓
   Step 4: Pago (opcional)
   ├─ Tarjeta (opcional, puede rellenarse después)
   └─ Confirmar
       ↓
   Step 5: Confirmación
   ├─ Revisar datos
   ├─ Aceptar términos
   └─ Botón "Registrarse"
       ↓
   Llamar registerTalento(TalentoData)
       ↓
   ┌─ supabase.auth.signUp(email, password)
   │    ├─ Crea auth.users (id: UUID)
   │    └─ Metadata: {role: 'talento'}
   │      ↓
   │  auth.users
   │  ├─ id: 550e8400-e29b-41d4-a716-446655440000
   │  ├─ email: user@example.com
   │  ├─ user_metadata: {role: 'talento'}
   │  └─ ...
   ├─ createProfileRecord({id, email, username, role, nombre})
   │    ├─ supabase.from("profiles").insert({
   │    │    id: 550e8400-...,
   │    │    email: user@example.com,
   │    │    username: juanperez,
   │    │    role: 'talento',
   │    │    nombre: Juan Pérez,
   │    │    ...
   │    │  })
   │    └─ profiles tabla actualizada
   ├─ supabase.from("talentos").insert({
   │    id: new_uuid,
   │    profile_id: 550e8400-...,
   │    email, nombre, username,
   │    doc_tipo, doc_numero,
   │    universidad, area,
   │    idiomas: JSON.stringify(...),
   │    status: 'active'
   │  })
   │  └─ talentos tabla actualizada
   ├─ Si fotoDocUri:
   │    └─ uploadImageIfExists(fotoDocUri, "private-docs", `docs/talento/550e8400-.../dui`)
   │         └─ Storage: private-docs/docs/talento/.../dui
   └─ Si fotoPerfilUri:
        └─ uploadImageIfExists(fotoPerfilUri, "public-media", `profiles/talento/.../foto`)
             ├─ Storage: public-media/profiles/talento/.../foto
             ├─ Obtiene URL pública
             └─ UPDATE talentos SET foto_perfil = url
       ↓
   Retorna {user, session}
       ↓
   useEffect detecta usuario autenticado
       ↓
   Redirecciona a "/dashboard-joventalento"
       ↓
   dashboard-joventalento.tsx carga
   ├─ useEffect: fetchUser()
   │  ├─ supabase.auth.getUser()
   │  └─ supabase.from("talentos").select().eq("id", user.id)
   └─ Renderiza perfil del talento
       ↓
   ┌────────────────────────────────────┐
   │ ÉXITO: Talento registrado         │
   │ ✓ auth.users creado               │
   │ ✓ profiles insertado              │
   │ ✓ talentos insertado              │
   │ ✓ Fotos subidas a storage         │
   │ ✓ Usuario en dashboard            │
   └────────────────────────────────────┘
```

---

## 4.2 Flujo: Empresa Crea Vacante

```
dashboard-empresa.tsx → Tab "Vacantes"
       ↓
Botón "+ Nueva Vacante"
       ↓
Modal abre (3 pasos)
   ├─ Paso 1: Datos
   │  ├─ Input: "Dev Senior React"
   │  ├─ Área: "Ingeniería"
   │  ├─ Modalidad: "Remoto"
   │  ├─ Tipo: "tiempo_completo"
   │  └─ Descripción: "...buscamos..."
   │
   ├─ Paso 2: Salario
   │  ├─ Mín: 1500
   │  ├─ Máx: 2500
   │  └─ Mostrar salario: ✓
   │
   └─ Paso 3: Horas sociales
      ├─ ¿Aplica para horas? ✓
      └─ Descripción: "...proyecto educativo"
       ↓
Botón "Crear Vacante"
       ↓
getPlanInfo(empresaId)
       ├─ SELECT COUNT vacantes activas → 2
       ├─ SELECT plan → "basico"
       └─ max_vacantes → 3
       ↓
¿activas < límite?
       ├─ SI (2 < 3): Continúa ↓
       └─ NO: Muestra UpgradePlanModal
       ↓
supabase.from("vacantes").insert({
    empresa_id: empresa_uuid,
    titulo: "Dev Senior React",
    area: "Ingeniería",
    modalidad: "Remoto",
    tipo: "tiempo_completo",
    descripcion: "...buscamos...",
    salario_min: 1500,
    salario_max: 2500,
    mostrar_salario: true,
    aplica_horas_sociales: true,
    estado: "activa",
    created_at: NOW()
})
       ↓
setVacantes([...vacantes, nuevaVacante])
       ↓
Toast: "Vacante creada exitosamente"
       ↓
Modal cierra
       ↓
Tabla se actualiza con nueva vacante
       ↓
┌─────────────────────────────────────┐
│ ÉXITO: Vacante publicada            │
│ ✓ Visible en plataforma             │
│ ✓ Talentos pueden ver y aplicar     │
│ ✓ Empresa ve en dashboard           │
└─────────────────────────────────────┘
```

---

## 4.3 Flujo: Talento Aplica a Vacante

```
dashboard-joventalento.tsx → Home
       ↓
Búsqueda/Listado de vacantes
   └─ supabase.from("vacantes").select("*, empresa:empresas(*)")
      .eq("estado", "activa")
       ↓
Selecciona vacante
   ├─ Titulo: "Dev Senior React"
   ├─ Empresa: "Empresa X"
   ├─ Modalidad: "Remoto"
   ├─ Salario: "$1500 - $2500"
   └─ Botón: "Aplicar"
       ↓
Ventana confirmación/aplicación
   ├─ Info vacante
   ├─ Info talento
   └─ Botón: "Confirmar aplicación"
       ↓
supabase.from("aplicaciones").insert({
    vacante_id: vacante_uuid,
    talento_id: talento_uuid,
    empresa_id: empresa_uuid,
    estado: "pendiente",
    fecha_aplicacion: NOW()
})
       ↓
supabase.from("notificaciones").insert({
    usuario_id: empresa_uuid,
    tipo: "aplicacion",
    titulo: "Nueva aplicación",
    mensaje: "Juan Pérez aplicó a Dev Senior React",
    leida: false
})
       ↓
Toast en talento: "¡Aplicación enviada!"
       ↓
Empresa ve notificación
       ↓
dashboard-empresa.tsx → Tab "Candidatos"
   └─ Columna "Pendiente"
      └─ Card aparece con candidato
       ↓
┌──────────────────────────────────────┐
│ ÉXITO: Aplicación registrada        │
│ ✓ En tabla aplicaciones             │
│ ✓ Empresa notificada               │
│ ✓ Talento ve confirmación          │
└──────────────────────────────────────┘
```

---

## 4.4 Flujo: Empresa Agenda Entrevista

```
dashboard-empresa.tsx → Tab "Candidatos"
       ↓
Kanban: Columna "Pendiente"
   └─ Card: Juan Pérez - "Dev Senior React"
       ↓
Botón: "Agendar entrevista"
       ↓
AgendarEntrevistaModal abre
   ├─ Modalidad: Virtual (seleccionado)
   ├─ Fecha: 05/06/2026
   ├─ Hora: 10:30
   ├─ Lugar: (vacío, virtual)
   └─ Notas: "Entrevista técnica"
       ↓
Botón: "Agendar"
       ↓
supabase.from("aplicaciones").update({
    estado: "entrevista"
}).eq("id", app_uuid)
       ↓
supabase.from("entrevistas").insert({
    aplicacion_id: app_uuid,
    empresa_id: empresa_uuid,
    solicitante_id: talento_uuid,
    vacante_id: vacante_uuid,
    fecha: "05/06/2026",
    hora: "10:30",
    modalidad: "virtual",
    lugar: null,
    notas: "Entrevista técnica",
    estado: "programada"
})
       ↓
supabase.from("notificaciones").insert({
    usuario_id: talento_uuid,
    tipo: "entrevista",
    titulo: "Entrevista programada",
    mensaje: "Tienes entrevista para 'Dev Senior React' el 05/06/2026 a las 10:30",
    leida: false
})
       ↓
Toast en empresa: "Entrevista agendada"
       ↓
Kanban actualiza: Card se mueve a columna "Entrevista"
       ↓
Talento abre app
   ├─ Icono notificaciones (campana) muestra badge
   ├─ Abre notificaciones
   └─ Ve "Entrevista programada"
       ↓
┌──────────────────────────────────────────┐
│ ÉXITO: Entrevista programada            │
│ ✓ Registrada en tabla entrevistas       │
│ ✓ Aplicación en estado "entrevista"     │
│ ✓ Ambos notificados                     │
│ ✓ Visible en dashboards de ambos        │
└──────────────────────────────────────────┘
```

---

## 4.5 Flujo: Universidad Solicita Validación de Horas

```
Universidad contacta Empresa
   "Tenemos grupo de 5 estudiantes que necesitan 40 horas sociales"
       ↓
Empresa crea solicitud (backend)
supabase.from("solicitudes_horas").insert({
    grupo_id: grupo_uuid,
    empresa_id: empresa_uuid,
    universidad_id: universidad_uuid,
    horas_solicitadas: 40,
    estado: "pendiente",
    created_at: NOW()
})
       ↓
Universidad recibe notificación
       ↓
dashboard-universidad.tsx → Tab "Horas Sociales"
   └─ Sub-tab "Pendiente"
      └─ Card: Grupo X - 40 horas
         ├─ Empresa: "Empresa Y"
         ├─ Botón: "Ver detalles"
         └─ Botón: "Revisar"
       ↓
Empresa recibe notificación también
       ↓
dashboard-empresa.tsx → Tab "Horas"
   └─ Sub-tab "Pendiente"
      └─ Card: "Solicitud de grupo X"
         ├─ Botón: "Enviar propuesta"
         ├─ Botón: "Rechazar"
         └─ Botón: "Ver detalles"
       ↓
Empresa: Botón "Enviar propuesta"
       ↓
PropuestaCondicionesModal abre
   ├─ Horas ofrecidas: 40 (prefillado)
   ├─ Fecha inicio: 01/07/2026
   ├─ Fecha fin: 15/08/2026
   ├─ Horario: "Lunes a Viernes 8:00-12:00"
   └─ Condiciones: "Trabajo presencial en nuestras oficinas"
       ↓
Botón: "Enviar propuesta"
       ↓
supabase.from("solicitudes_horas").update({
    estado: "en_revision",
    horas_ofrecidas: 40,
    fecha_inicio: "01/07/2026",
    fecha_fin: "15/08/2026",
    horario: "Lunes a Viernes 8:00-12:00",
    condiciones: "Trabajo presencial en nuestras oficinas"
}).eq("id", solicitud_uuid)
       ↓
supabase.from("notificaciones").insert({
    usuario_id: universidad_uuid,
    tipo: "horas_sociales",
    titulo: "Propuesta de condiciones",
    mensaje: "Empresa Y envió propuesta de condiciones para grupo X",
    leida: false
})
       ↓
Toast en empresa: "Propuesta enviada"
       ↓
Card en empresa se mueve a "En revisión"
       ↓
Universidad ve notificación
       ↓
dashboard-universidad.tsx → Tab "Horas"
   └─ Sub-tab "En revisión"
      └─ Card actualizado con propuesta
         ├─ Horas ofrecidas: 40
         ├─ Período: 01/07 - 15/08
         ├─ Botón: "Aprobar"
         ├─ Botón: "Rechazar"
         └─ Botón: "Contrapropuesta"
       ↓
Universidad: Botón "Aprobar"
       ↓
supabase.from("solicitudes_horas").update({
    estado: "aprobada"
}).eq("id", solicitud_uuid)
       ↓
supabase.from("notificaciones").insert({
    usuario_id: empresa_uuid,
    tipo: "horas_sociales",
    titulo: "Solicitud aprobada",
    mensaje: "La universidad aprobó la validación de 40 horas",
    leida: false
})
       ↓
┌──────────────────────────────────────────────┐
│ ÉXITO: Horas Sociales Validadas             │
│ ✓ Solicitud en estado "aprobada"            │
│ ✓ Empresa puede generar certificado         │
│ ✓ Estudiantes tienen horas validadas        │
│ ✓ Ambos notificados del resultado           │
└──────────────────────────────────────────────┘
```

---

# ⚠️ PARTE 5: DIAGNÓSTICO DE PROBLEMAS

## 5.1 Problemas Críticos

### 1. ❌ SIN VALIDACIÓN RLS (Row Level Security)

**Problema:**

- No hay políticas RLS configuradas en Supabase
- Cliente anon_key puede teóricamente acceder a datos de otros usuarios
- No está explícitamente documentado

**Impacto:** 🔴 CRÍTICO - Riesgo de seguridad

**Recomendación:**

```sql
-- Políticas RLS para tabla profiles
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Similar para talentos, empresas, universidades
```

---

### 2. ❌ SIN CONTROL DE ACCESO A STORAGE PRIVADO

**Problema:**

- Bucket `private-docs` sin RLS
- Rutas de documentos son predecibles (uuid fácil de adivinar)
- Cualquier usuario podría acceder a DUI, pasaportes, selfies ajenos

**Impacto:** 🔴 CRÍTICO - Privacidad comprometida

**Recomendación:**

```sql
-- RLS en Storage bucket private-docs
CREATE POLICY "Users can access own docs"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'private-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

### 3. ❌ DUPLICACIÓN DE CONFIGURACIÓN SUPABASE

**Problema:**

```
lib/supabase.ts (ACTUAL, RECOMENDADO)
config/supabase.js (LEGADO, NO USADO)
```

**Impacto:** 🟡 ALTO - Confusión en mantenimiento

**Recomendación:** Eliminar `config/supabase.js`

---

### 4. ❌ SIN MIGRACIONES VERSIONADAS

**Problema:**

- Schema SQL solo en documentación
- No hay registro de cambios en BD
- Difícil reproducir en diferentes ambientes

**Impacto:** 🟡 ALTO - DevOps difícil

**Recomendación:** Usar Supabase Migrations CLI

---

### 5. ❌ TIPOS TypeScript INCOMPLETOS

**Problema:**

```typescript
type Vacante = Record<string, any>; // ❌ No type-safe
type Aplicacion = Record<string, any>; // ❌ No type-safe
```

**Impacto:** 🟡 ALTO - Errores en runtime

**Recomendación:**

```typescript
interface Vacante {
  id: string;
  empresa_id: string;
  titulo: string;
  // ... todos los campos
}

interface Aplicacion {
  id: string;
  vacante_id: string;
  talento_id: string;
  // ... todos los campos
}
```

---

## 5.2 Problemas Moderados

### 6. 🟡 Sin Caché de Datos

**Problema:**

- Cada navegación re-fetch datos completos
- Sin React Query, SWR u otro cache
- Waste de queries a BD

**Impacto:** 🟡 MODERADO - Rendimiento

---

### 7. 🟡 Lógica Embebida en Componentes

**Problema:**

```typescript
// dashboard-universidad.tsx tiene 2000+ líneas
// loadGruposAutenticado() embebida en componente
// Difícil de testear y reutilizar
```

**Impacto:** 🟡 MODERADO - Mantenibilidad

**Recomendación:** Extraer a hooks: `useLoadGrupos()`

---

### 8. 🟡 Sin Manejo Consistente de Errores

**Problema:**

- Algunos lugares: `try-catch` + `Alert.alert()`
- Otros: `console.error()` silencioso
- Sin retry logic
- Sin fallback UI

**Impacto:** 🟡 MODERADO - UX inconsistente

---

### 9. 🟡 Tabla `profiles` Demasiado Genérica

**Problema:**

```typescript
// Campos que pueden ser null dependiendo del rol
username: TEXT NOT NULL (¿Todos tienen?)
doc_tipo: TEXT (¿Solo talentos?)
universidad: TEXT (¿Solo alumnos?)
cargo: TEXT (¿Solo empresas?)
```

**Impacto:** 🟡 MODERADO - Validación débil

---

## 5.3 Problemas Menores

### 10. 🟢 OTP Hardcodeada

**Problema:**

- OTP no se envía por email automáticamente
- Flujo de recuperación no es real

**Impacto:** 🟢 BAJO - Funciona en desarrollo

---

### 11. 🟢 Sin Rate Limiting

**Problema:**

- Fuerza bruta posible en login
- Spam en registros

**Impacto:** 🟢 BAJO - Supabase Auth tiene límites básicos

---

### 12. 🟢 Sin Audit Logs

**Problema:**

- No hay registro de quién hizo qué
- Compliance difícil

**Impacto:** 🟢 BAJO - Futuro requerimiento

---

# ✅ PARTE 6: RECOMENDACIONES DE MEJORA

## Prioridad 1 - CRÍTICO (Implementar ya)

- [ ] **Implementar RLS** en Supabase (profiles, talentos, empresas, etc.)
- [ ] **Proteger Storage** con RLS (private-docs)
- [ ] **Eliminar config duplicada** (remover config/supabase.js)
- [ ] **Crear tipos TypeScript completos** (archivo types/index.ts)

## Prioridad 2 - ALTO (Próximas 2 semanas)

- [ ] **Migraciones SQL versionadas** (Supabase CLI)
- [ ] **Caché con TanStack Query** (@tanstack/react-query)
- [ ] **Error handling centralizado** (ErrorService)
- [ ] **Hooks reutilizables** (useLoadVacantes, useLoadGrupos, etc.)

## Prioridad 3 - MEDIO (Próximo mes)

- [ ] **Refactorizar tabla profiles** (normalización)
- [ ] **Autenticación social** (Google, GitHub)
- [ ] **Email reales para OTP** (EmailJS o SendGrid)
- [ ] **Tests unitarios** (Jest + React Native Testing Library)

## Prioridad 4 - BAJO (Futuro)

- [ ] Rate limiting
- [ ] Audit logs
- [ ] Analytics
- [ ] API GraphQL (alternative to REST)

---

# 📊 RESUMEN FINAL

## Dashboard Rápido

| Aspecto        | Estado               | Crítico |
| -------------- | -------------------- | ------- |
| Conexión BD    | ✅ Supabase correcto | No      |
| Schema BD      | ✅ Bien estructurado | No      |
| Autenticación  | ✅ Funcional         | No      |
| Storage        | ⚠️ Sin RLS           | SÍ      |
| Seguridad RLS  | ❌ No implementada   | SÍ      |
| Tipos TS       | ⚠️ Genéricos         | No      |
| Caché          | ❌ Ninguno           | No      |
| Migraciones    | ❌ Manual            | No      |
| Error handling | ⚠️ Inconsistente     | No      |
| Documentación  | ✅ Excelente         | No      |

## Tablas Principales (12 total)

```
✅ profiles (Central de usuarios)
✅ talentos (Profesionales independientes)
✅ empresas (Empleadores)
✅ universidades (Instituciones educativas)
✅ alumnos (Estudiantes)
✅ vacantes (Ofertas de empleo)
✅ aplicaciones (Candidaturas)
✅ grupos (Grupos de estudiantes)
✅ solicitudes_horas (Validación de horas sociales)
✅ entrevistas (Seguimiento de entrevistas)
✅ notificaciones (Sistema de alertas)
✅ suscripciones_empresas (Gestión de planes)
```

## Dashboards Implementados (8 total)

```
✅ dashboard-empresa (Empleador)
✅ dashboard-universidad (Universidad)
✅ dashboard-estudiante (Alumno)
✅ dashboard-joventalento (Talento independiente)
✅ dashboard-admin (Administración)
✅ iniciosesion (Login)
✅ registro (Signup multi-flujo)
✅ (tabs) (Home inicial)
```

## Componentes Modales (8 total)

```
✅ AgendarEntrevistaModal
✅ PropuestaCondicionesModal
✅ RechazarModal
✅ UpgradePlanModal
✅ CambiarPasswordModal
✅ GroupCreationModal
✅ GroupDetailModal
✅ ProfileViewerModal
```

---

**Conclusión:** Proyecto bien estructurado con base sólida pero requiere atención inmediata a seguridad (RLS) antes de ir a producción.
