# Guía de Integración de Autenticación - Gradly

## 📚 Descripción General

Este documento explica cómo está configurado el sistema de autenticación y base de datos de Gradly, y cómo se integra con tu formulario de registro multietapas.

---

## 🏗️ Estructura del Proyecto

### Archivos Principales

1. **`lib/supabase.ts`** - Cliente de Supabase configurado
   - Configura la conexión a Supabase
   - En móvil: usa `expo-secure-store` para almacenamiento encriptado
   - En web: usa localStorage

2. **`services/authService.ts`** - Servicios de autenticación
   - `registerTalento(data)` - Registra nuevos talentos
   - `registerEmpresa(data)` - Registra nuevas empresas
   - `registerUniversidad(data)` - Registra nuevas universidades
   - `loginUser(emailOrUsername, password)` - Inicia sesión
   - `logout()` - Cierra sesión
   - `getCurrentUser()` - Obtiene el usuario actual
   - `getSession()` - Obtiene la sesión actual

3. **`config/supabase.js`** - Configuración alternativa (mantenerla por compatibilidad)

4. **`app/registro.tsx`** - Componente de registro (ya integrado)

---

## 🔄 Flujo de Registro

### Para Talento (Joven Talento)

```
1. Recopila datos personales (nombre, email, username, etc.)
2. Recopila datos de identificación (DUI, pasaporte, etc.)
3. Recopila idiomas y habilidades
4. Recopila información de pago
5. Valida todos los datos
6. Llama a registerTalento(data)
   ├─ Crea cuenta en Supabase Auth
   ├─ Inserta perfil en tabla 'profiles'
   └─ Retorna datos de usuario autenticado
```

### Para Empresa

```
1. Recopila datos de la empresa (nombre, industria, etc.)
2. Recopila datos del representante legal
3. Recopila información de pago
4. Valida todos los datos
5. Llama a registerEmpresa(data)
   ├─ Crea cuenta en Supabase Auth (con email del representante)
   ├─ Inserta perfil del representante en 'profiles'
   ├─ Inserta datos de la empresa en 'empresas'
   └─ Retorna datos de usuario autenticado
```

### Para Universidad

```
1. Recopila datos institucionales
2. Recopila datos del rector
3. Recopila datos del encargado académico
4. Recopila información de carreras
5. Valida todos los datos
6. Llama a registerUniversidad(data)
   ├─ Crea cuenta en Supabase Auth (con email del encargado)
   ├─ Inserta perfil del encargado en 'profiles'
   ├─ Inserta datos de la universidad en 'universidades'
   └─ Retorna datos de usuario autenticado
```

---

## 📊 Estructura de Datos

### Interface: `TalentoData`

```typescript
{
  email: string;
  password: string;
  nombre: string;
  username: string;
  telefono: string;
  departamento: string;
  ciudad: string;
  bio: string;
  habilidades: string;
  idiomas: { name: string; level: string }[];
  docTipo: string; // "dui", "pasaporte", "licencia"
  docNumero: string;
  universidad: string;
  area: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  github?: string;
  behance?: string;
}
```

### Interface: `EmpresaData`

```typescript
{
  // Datos de empresa
  email: string; // Email de contacto
  password: string;
  username: string;
  nombre: string; // Nombre de la empresa
  industria: string;
  descripcion: string;
  departamento: string;
  ciudad: string;
  direccion?: string;
  telefono: string; // Teléfono de empresa
  emailCorporativo: string;
  web?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;

  // Datos del representante
  repNombre: string;
  repCargo: string;
  repEmail: string;
  repTelefono: string;
  repFacebook?: string;
  repInstagram?: string;
}
```

### Interface: `UniversidadData`

```typescript
{
  // Datos de institución
  email: string; // Email del encargado
  password: string;
  username: string;
  nombre: string; // Nombre de la universidad
  departamento: string;
  ciudad: string;
  direccion?: string;
  emailInstitucional: string;
  web?: string;
  telefono: string;
  descripcion: string;
  instagram?: string;
  tiktok?: string;
  github?: string;
  behance?: string;

  // Datos del rector
  rectorNombre: string;
  rectorDocTipo: string;
  rectorDocNumero: string;

  // Datos del encargado académico
  encNombre: string;
  encTelefono: string;
  encEmail: string;
  encInstagram?: string;
  encLinkedin?: string;

  // Carreras ofertadas
  carreras: {
    nombre: string;
    duracion: string;
    modalidad: string;
    coordinador: string;
  }[];
}
```

---

## 🔐 Manejo de Errores

### En `registro.tsx`

El componente ya tiene manejo de errores implementado:

```typescript
try {
  if (flow === "talento") {
    await registerTalento({
      /* datos */
    });
  } else if (flow === "empresa") {
    await registerEmpresa({
      /* datos */
    });
  } else if (flow === "universidad") {
    await registerUniversidad({
      /* datos */
    });
  }
  setStep(99); // Éxito
} catch (err: any) {
  const msg: string = (err?.message ?? "").toLowerCase();

  if (msg.includes("already registered")) {
    // Usuario ya existe
    setErr("emailField", "Este correo ya está registrado.");
  } else if (msg.includes("profiles_username_key")) {
    // Username duplicado
    setErr("usernameField", "Este nombre de usuario ya está en uso.");
  } else {
    // Error genérico
    setRegisterError(err?.message ?? "Error desconocido");
  }
}
```

### Errores Comunes

| Error                                   | Cause                       | Solución                                     |
| --------------------------------------- | --------------------------- | -------------------------------------------- |
| `already registered`                    | Email ya existe             | Solicitar al usuario un email diferente      |
| `profiles_username_key`                 | Username duplicado          | Solicitar al usuario un username diferente   |
| `No se pudo crear la cuenta de usuario` | Error de Supabase Auth      | Verificar conectividad y configuración       |
| `PGRST116`                              | Tabla no existe en Supabase | Crear las tablas siguiendo SUPABASE_SETUP.md |
| `insufficient_scope`                    | Permisos insuficientes      | Revisar RLS policies                         |

---

## 🔑 Tipos de Registro y Roles

El sistema maneja tres tipos de usuarios, cada uno con un rol específico:

| Rol           | Descripción                              | Tabla Principal | Estado Inicial |
| ------------- | ---------------------------------------- | --------------- | -------------- |
| `talento`     | Joven profesional buscando oportunidades | `profiles`      | `active`       |
| `empresa`     | Empresa buscando talento                 | `empresas`      | `pending`      |
| `universidad` | Institución educativa                    | `universidades` | `pending`      |

---

## 🛠️ Funciones Auxiliares

### Obtener Usuario Actual

```typescript
import { getCurrentUser } from "@/services/authService";

const user = await getCurrentUser();
console.log(user?.id, user?.email, user?.user_metadata?.role);
```

### Obtener Sesión

```typescript
import { getSession } from "@/services/authService";

const session = await getSession();
if (session) {
  console.log("Usuario autenticado:", session.user.email);
}
```

### Cerrar Sesión

```typescript
import { logout } from "@/services/authService";

await logout();
// Redirigir a pantalla de login
```

---

## ⚙️ Configuración de Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
EXPO_PUBLIC_SUPABASE_URL=https://kbevyjupphyxrgcvdsgv.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

Para cambiar en futuro desde variable de entorno:

```typescript
// lib/supabase.ts
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
```

---

## 🧪 Pruebas en Desarrollo

### Con Expo Go

1. Asegúrate de que la aplicación esté corriendo:

   ```bash
   npx expo start
   ```

2. Abre Expo Go en tu dispositivo

3. Prueba el flujo completo de registro

4. Verifica en el Dashboard de Supabase que se han creado los datos

### Debugging

En `registro.tsx`, puedes agregar logs para depuración:

```typescript
console.log("Datos de registro:", data);
console.log("Respuesta de Supabase:", authData);
```

---

## 🚀 Próximos Pasos para Producción

1. ✅ Implementar confirmación de email
2. ✅ Implementar verificación de teléfono (SMS)
3. ✅ Agregar autenticación OAuth (Google, Microsoft)
4. ✅ Implementar re-verificación periódica de datos
5. ✅ Agregar auditoría de cambios
6. ✅ Implementar backups automáticos
7. ✅ Configurar alertas en Supabase

---

## 📞 Soporte y Troubleshooting

### Problema: Error 401 Unauthorized

**Causa:** Token de autenticación inválido o expirado
**Solución:**

- Verifica que `SUPABASE_ANON_KEY` esté correcta
- Comprueba que la aplicación tenga permiso de lectura/escritura
- Reinicia la aplicación

### Problema: Tabla no encontrada (PGRST116)

**Causa:** Las tablas no existen en Supabase
**Solución:**

- Sigue los pasos en `SUPABASE_SETUP.md`
- Verifica que hayas ejecutado todos los scripts SQL

### Problema: RLS denies access

**Causa:** Las políticas de Row Level Security bloquean el acceso
**Solución:**

- Desactiva RLS temporalmente para pruebas
- Revisa que las políticas permitan acceso al `auth.uid()`

---

## 📝 Notas Importantes

1. **Seguridad:** Nunca expongas las claves de Supabase en el código (usa .env)
2. **Encriptación:** En móvil, las sesiones se encriptan automáticamente con expo-secure-store
3. **Validación:** Implementa validación adicional en servidor para datos críticos
4. **Rate Limiting:** Considera agregar rate limiting en funciones de registro
5. **Backup:** Configura backups automáticos en Supabase

---

## 🎓 Referencias

- [Documentación de Supabase](https://supabase.com/docs)
- [Expo Secure Store](https://docs.expo.dev/modules/expo-secure-store/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
