# Configuración de Supabase para Gradly

## 📋 Tablas Requeridas en Supabase

Las siguientes tablas deben ser creadas en tu proyecto de Supabase. Puedes hacerlo directamente en el Dashboard de Supabase o ejecutar los scripts SQL proporcionados.

---

## 1. Tabla: `profiles` (Perfiles de Usuarios)

Almacena la información del perfil de todos los usuarios (talento, empresa, universidad).

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('talento', 'empresa', 'universidad', 'alumno', 'estudiante', 'admin', 'administrador')),
  username TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  departamento TEXT,
  ciudad TEXT,
  bio TEXT,
  habilidades TEXT,
  idiomas JSONB,
  doc_tipo TEXT,
  doc_numero TEXT,
  universidad TEXT,
  area TEXT,
  cargo TEXT,
  linkedin TEXT,
  instagram TEXT,
  facebook TEXT,
  tiktok TEXT,
  github TEXT,
  behance TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
```

---

## 2. Tabla: `talentos` (Información Detallada de Talentos)

Almacena información adicional de usuarios individuales registrados como talento.

```sql
CREATE TABLE talentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  telefono TEXT,
  departamento TEXT,
  ciudad TEXT,
  bio TEXT,
  habilidades TEXT,
  idiomas JSONB,
  doc_tipo TEXT,
  doc_numero TEXT,
  universidad TEXT,
  area TEXT,
  instagram TEXT,
  linkedin TEXT,
  tiktok TEXT,
  github TEXT,
  behance TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_talentos_profile_id ON talentos(profile_id);
CREATE INDEX idx_talentos_email ON talentos(email);
CREATE INDEX idx_talentos_username ON talentos(username);
```

---

## 3. Tabla: `empresas` (Información de Empresas)

Almacena información de empresas registradas en la plataforma.

```sql
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  industria TEXT NOT NULL,
  descripcion TEXT,
  departamento TEXT,
  ciudad TEXT,
  direccion TEXT,
  telefono TEXT NOT NULL,
  email_corporativo TEXT NOT NULL UNIQUE,
  web TEXT,
  instagram TEXT,
  facebook TEXT,
  tiktok TEXT,
  representante_nombre TEXT NOT NULL,
  representante_cargo TEXT NOT NULL,
  representante_email TEXT NOT NULL,
  representante_telefono TEXT NOT NULL,
  representante_facebook TEXT,
  representante_instagram TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_empresas_owner_id ON empresas(owner_id);
CREATE INDEX idx_empresas_email_corporativo ON empresas(email_corporativo);
CREATE INDEX idx_empresas_industria ON empresas(industria);
```

---

## 4. Tabla: `universidades` (Información de Instituciones Educativas)

Almacena información de universidades e instituciones educativas registradas.

```sql
CREATE TABLE universidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  departamento TEXT,
  ciudad TEXT,
  direccion TEXT,
  email_institucional TEXT NOT NULL UNIQUE,
  web TEXT,
  telefono TEXT NOT NULL,
  descripcion TEXT,
  instagram TEXT,
  tiktok TEXT,
  github TEXT,
  behance TEXT,
  rector_nombre TEXT NOT NULL,
  rector_doc_tipo TEXT NOT NULL,
  rector_doc_numero TEXT NOT NULL,
  encargado_nombre TEXT NOT NULL,
  encargado_telefono TEXT NOT NULL,
  encargado_email TEXT NOT NULL,
  encargado_instagram TEXT,
  encargado_linkedin TEXT,
  carreras JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_universidades_owner_id ON universidades(owner_id);
CREATE INDEX idx_universidades_email_institucional ON universidades(email_institucional);
```

---

## 5. Tablas: Administración (Panel Admin)

Estas tablas son requeridas por las pantallas de administración para bitácora, notificaciones y permisos.

```sql
CREATE TABLE permissions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  group_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);

CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 📝 Configuración de Políticas de Row Level Security (RLS)

Se recomienda habilitar RLS en todas las tablas para mayor seguridad:

```sql
-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE universidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Ejemplo de política: Usuarios solo pueden ver/editar su propio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

-- Empresas: Solo el owner puede ver/editar
CREATE POLICY "Company owner can view own company" ON empresas
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Company owner can update own company" ON empresas
  FOR UPDATE USING (auth.uid() = owner_id);

-- Universidades: Solo el owner puede ver/editar
CREATE POLICY "University owner can view own university" ON universidades
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "University owner can update own university" ON universidades
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Admins can manage permissions" ON permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

CREATE POLICY "Admins can manage role permissions" ON role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

CREATE POLICY "Admins can manage admin notifications" ON admin_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

CREATE POLICY "Admins can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );

CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'administrador')
    )
  );
```

---

## 🔐 Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
EXPO_PUBLIC_SUPABASE_URL=https://kbevyjupphyxrgcvdsgv.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

**Nota:** Para producción, asegúrate de usar variables de entorno seguras y nunca expongas la clave anon en el código fuente.

---

## 🚀 Próximos Pasos

1. ✅ Crea las tablas en tu proyecto de Supabase usando los scripts SQL anteriores
2. ✅ Habilita RLS en las tablas para mayor seguridad
3. ✅ Verifica que los índices se hayan creado correctamente
4. ✅ Prueba las funciones de registro en `services/authService.ts`
5. ✅ Integra la autenticación en tu componente `registro.tsx`

---

## 📦 Dependencias Requeridas

Asegúrate de tener instaladas las siguientes dependencias:

```bash
npm install @supabase/supabase-js expo-secure-store react-native-url-polyfill
```

---

## 🧪 Pruebas

Para probar localmente:

1. Accede a tu dashboard de Supabase
2. Verifica que la autenticación esté habilitada
3. Usa Expo Go para ejecutar la aplicación
4. Intenta registrar un nuevo usuario (talento, empresa o universidad)
5. Verifica en el dashboard que los datos se hayan guardado correctamente

---

## ⚠️ Consideraciones de Seguridad

- Las contraseñas se almacenan de forma segura en Supabase Auth
- Las sesiones se encriptan usando `expo-secure-store` en dispositivos móviles
- Implementa validación adicional en el servidor para campos críticos
- Usa HTTPS en producción
- Implementa rate limiting para las funciones de registro y login

---

## 📞 Soporte

Si tienes problemas:

1. Verifica los logs en la consola de Supabase
2. Revisa que las tablas estén correctamente creadas
3. Asegúrate de que RLS no esté bloqueando las inserciones
4. Comprueba que los tokens de autenticación sean válidos
