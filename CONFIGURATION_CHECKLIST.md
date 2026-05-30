# ✨ Checklist de Configuración Final - Gradly Backend

## 📝 Antes de Comenzar

- [ ] Tienes acceso a tu Dashboard de Supabase
- [ ] Tienes Expo Go instalado en tu dispositivo
- [ ] Node.js y npm están instalados
- [ ] Tienes la rama de código actualizada

---

## 🔧 Fase 1: Configurar Base de Datos (CRÍTICO)

### Paso 1: Copiar Scripts SQL

- [ ] Abre el archivo `SUPABASE_SETUP.md` en tu editor
- [ ] Copia el contenido de la sección "Tablas Requeridas"

### Paso 2: Crear Tablas

- [ ] Ve a tu Dashboard de Supabase
- [ ] Navega a SQL Editor
- [ ] Pega y ejecuta el script para crear la tabla `profiles`
- [ ] Pega y ejecuta el script para crear la tabla `empresas`
- [ ] Pega y ejecuta el script para crear la tabla `universidades`
- [ ] **Opcional:** Pega y ejecuta los scripts de RLS

### Paso 3: Verificar Tablas

- [ ] Ve a Database → Tables
- [ ] Verifica que existan las 4 tablas: `profiles`, `empresas`, `universidades`
- [ ] Verifica que tengan las columnas correctas
- [ ] Anota los nombres de las columnas para verificación

---

## 📦 Fase 2: Instalar Dependencias

### Paso 4: Verificar Dependencias

```bash
# En la terminal, navega a la raíz del proyecto
cd /ruta/a/Gradly

# Verifica que tengas todas las dependencias
npm list @supabase/supabase-js expo-secure-store react-native-url-polyfill
```

### Paso 5: Instalar si Faltan

```bash
# Si alguna falta, instálalas
npx expo install @supabase/supabase-js react-native-url-polyfill expo-secure-store
```

**Checkboxes:**

- [ ] @supabase/supabase-js instalado
- [ ] expo-secure-store instalado
- [ ] react-native-url-polyfill instalado

---

## 🔐 Fase 3: Configurar Variables de Entorno (Opcional pero Recomendado)

### Paso 6: Crear .env.local

- [ ] Crea un archivo `.env.local` en la raíz del proyecto
- [ ] Copia el contenido de la sección "Variables de Entorno" en `AUTH_INTEGRATION_GUIDE.md`
- [ ] Guarda el archivo

**Contenido de `.env.local`:**

```env
EXPO_PUBLIC_SUPABASE_URL=https://kbevyjupphyxrgcvdsgv.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

---

## ✅ Fase 4: Verificar Código

### Paso 7: Revisar Archivos

- [ ] `lib/supabase.ts` - Debe importar `expo-secure-store`
- [ ] `services/authService.ts` - Debe tener las 3 funciones de registro
- [ ] `config/supabase.js` - Actualizado con comentarios

### Paso 8: No Hay Errores de Sintaxis

```bash
# En la terminal
npm run lint
# O verifica en VS Code que no haya errores rojos
```

- [ ] Sin errores de TypeScript
- [ ] Sin errores de ESLint

---

## 🚀 Fase 5: Pruebas Locales

### Paso 9: Iniciar Expo

```bash
# En la terminal
npx expo start
```

- [ ] Expo comienza correctamente
- [ ] No hay errores en la consola

### Paso 10: Abrir en Dispositivo

- [ ] Abre Expo Go en tu dispositivo
- [ ] Escanea el código QR que aparece en la terminal
- [ ] La app carga sin errores

### Paso 11: Probar Registro de Talento

- [ ] Navega al formulario de registro
- [ ] Selecciona "Joven Talento"
- [ ] Completa todos los 5 pasos:
  - [ ] Paso 1: Datos (email, password, nombre, username)
  - [ ] Paso 2: Identidad (DUI/pasaporte, universidad, área)
  - [ ] Paso 3: Perfil (bio, habilidades, idiomas)
  - [ ] Paso 4: Pago (método de pago)
  - [ ] Paso 5: Seguridad (confirmar datos)
- [ ] Haz clic en "Enviar"
- [ ] **Resultado esperado:** "Registro exitoso" o redirección a dashboard

### Paso 12: Verificar en Supabase

- [ ] Ve a Authentication → Users
- [ ] Deberías ver tu nuevo usuario registrado
- [ ] Ve a la tabla `profiles`
- [ ] Deberías ver tu perfil con todos los datos
- [ ] Verifica que `id` coincida con el del usuario en Auth

### Paso 13: Probar Registro de Empresa

- [ ] Cierra sesión (si fue necesario)
- [ ] Navega al formulario de registro
- [ ] Selecciona "Empresa"
- [ ] Completa todos los 5 pasos:
  - [ ] Paso 1: Empresa (nombre, industria, descripción)
  - [ ] Paso 2: Visual (logo, etc.)
  - [ ] Paso 3: Antifraude
  - [ ] Paso 4: Pago
  - [ ] Paso 5: Representante
- [ ] Haz clic en "Enviar"
- [ ] **Resultado esperado:** "Registro exitoso"

### Paso 14: Verificar en Supabase

- [ ] Ve a la tabla `empresas`
- [ ] Deberías ver tu empresa registrada
- [ ] Verifica que todos los datos del representante estén guardados

### Paso 15: Probar Registro de Universidad

- [ ] Navega al formulario de registro
- [ ] Selecciona "Universidad"
- [ ] Completa todos los 5 pasos:
  - [ ] Paso 1: Institución (nombre, descripción)
  - [ ] Paso 2: Visual (logo, etc.)
  - [ ] Paso 3: Antifraude
  - [ ] Paso 4: Carreras (agregar varias carreras)
  - [ ] Paso 5: Responsable (rector y encargado académico)
- [ ] Haz clic en "Enviar"
- [ ] **Resultado esperado:** "Registro exitoso"

### Paso 16: Verificar en Supabase

- [ ] Ve a la tabla `universidades`
- [ ] Deberías ver tu universidad registrada
- [ ] Verifica que datos del rector y encargado estén guardados
- [ ] Verifica que las carreras estén guardadas como JSON

---

## 🔄 Fase 6: Probar Login

### Paso 17: Probar Login con Email

- [ ] Navega a la pantalla de login
- [ ] Ingresa el email de tu usuario talento
- [ ] Ingresa la contraseña
- [ ] Haz clic en "Iniciar Sesión"
- [ ] **Resultado esperado:** Redirección al dashboard de talento

### Paso 18: Probar Login con Username

- [ ] Navega a la pantalla de login
- [ ] Ingresa el username de tu usuario talento
- [ ] Ingresa la contraseña
- [ ] Haz clic en "Iniciar Sesión"
- [ ] **Resultado esperado:** Redirección al dashboard de talento

### Paso 19: Probar Errores de Login

- [ ] Intenta login con email incorrecto
- [ ] **Resultado esperado:** Mensaje de error
- [ ] Intenta login con contraseña incorrecta
- [ ] **Resultado esperado:** Mensaje de error

---

## 🐛 Troubleshooting - Si Algo Falla

### Error: "Tabla no encontrada (PGRST116)"

- [ ] Verifica que creaste todas las tablas en Supabase
- [ ] Verifica que el nombre de las tablas sea exacto: `profiles`, `empresas`, `universidades`
- [ ] Revisa los scripts SQL en `SUPABASE_SETUP.md`

### Error: "401 Unauthorized"

- [ ] Verifica que `SUPABASE_ANON_KEY` sea correcta
- [ ] Verifica que no haya caracteres extra en la clave
- [ ] Reinicia Expo Go

### Error: "already registered"

- [ ] El email ya existe en otro registro anterior
- [ ] Usa un email diferente
- [ ] O elimina el usuario de Supabase y vuelve a intentar

### Error: "username key"

- [ ] El username ya existe
- [ ] Usa un username diferente
- [ ] Verifica que no lo hayas usado antes

### Error: "RLS denies access"

- [ ] Has habilitado RLS pero las políticas no son correctas
- [ ] Deshabilita RLS temporalmente:
  ```sql
  ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
  ALTER TABLE empresas DISABLE ROW LEVEL SECURITY;
  ALTER TABLE universidades DISABLE ROW LEVEL SECURITY;
  ```
- [ ] Intenta de nuevo
- [ ] Luego habilita RLS con políticas correctas

### No aparece nada en Supabase después de registrar

- [ ] Verifica que no hay errores en la consola de Expo Go
- [ ] Verifica que RLS no esté bloqueando
- [ ] Recarga el Dashboard de Supabase (F5)
- [ ] Verifica que estés viendo la tabla correcta

---

## 📋 Fase 7: Documentación para Referencia

### Archivos de Referencia

- [ ] `SUPABASE_SETUP.md` - Scripts SQL y configuración de BD
- [ ] `AUTH_INTEGRATION_GUIDE.md` - Guía completa de integración
- [ ] `QUICK_START.md` - Resumen rápido
- [ ] `services/authService.ts` - Código con comentarios
- [ ] `lib/supabase.ts` - Configuración del cliente

### Copiar URLs Útiles

- [ ] URL del Dashboard: https://supabase.com/dashboard
- [ ] Nombre del proyecto: **\*\***\_\_\_**\*\***
- [ ] ID del proyecto: **\*\***\_\_\_**\*\***

---

## 🎉 Fase 8: Próximos Pasos

### Después de que todo funcione:

1. **Implementar Pantalla de Login**
   - [ ] Crear componente de login
   - [ ] Integrar `loginUser()` del service
   - [ ] Guardar el rol para redirigir a dashboard correcto

2. **Proteger Rutas**
   - [ ] Implementar sistema de rutas protegidas
   - [ ] Verificar sesión activa
   - [ ] Redirigir a login si no hay sesión

3. **Pantallas de Dashboard**
   - [ ] Dashboard para talento
   - [ ] Dashboard para empresa
   - [ ] Dashboard para universidad

4. **Funcionalidades Adicionales**
   - [ ] Editar perfil
   - [ ] Cambiar contraseña
   - [ ] Recuperar contraseña
   - [ ] Eliminar cuenta

5. **Seguridad**
   - [ ] Habilitar RLS con políticas correctas
   - [ ] Implementar rate limiting
   - [ ] Agregar validación en servidor
   - [ ] Configurar CORS

6. **Producción**
   - [ ] Usar variables de entorno
   - [ ] Configurar dominio personalizado
   - [ ] Configurar backups
   - [ ] Implementar monitoreo

---

## ✨ Resumen Final

**Cuando hayas completado TODOS los checkboxes anteriores:**

✅ Base de datos configurada  
✅ Dependencias instaladas  
✅ Código sin errores  
✅ Registro de 3 tipos de usuarios funcionando  
✅ Login funcionando con email y username  
✅ Datos guardados correctamente en Supabase  
✅ Documentación lista para referencia

---

## 📞 Si Necesitas Ayuda

1. Revisa los comentarios en el código
2. Lee la documentación (ver Phase 7)
3. Verifica los logs en Supabase → SQL Editor → Logs
4. Verifica la consola de Expo Go

---

**¡Felicidades! Tu backend de autenticación y base de datos está listo. 🚀**
