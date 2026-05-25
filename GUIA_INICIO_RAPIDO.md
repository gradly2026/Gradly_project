# 🚀 Guía de Inicio Rápido - `loadGruposAutenticado()`

## ¿Qué se agregó?

Una nueva función **`loadGruposAutenticado()`** que obtiene e imprime los grupos creados por el usuario autenticado desde la tabla `grupos` de Supabase.

---

## 📦 Cambios Realizados

### ✅ Archivo Modificado

- **`app/dashboard-universidad.tsx`**
  - ✓ Función agregada (línea ~954)
  - ✓ Integración en useEffect (línea ~1186)

### 📚 Documentación Creada

1. **GRUPOS_AUTENTICADO_DOCS.md** - Guía completa
2. **GRUPOS_EJEMPLOS_USO.md** - 8 ejemplos prácticos
3. **GRUPOS_REFERENCIA_TECNICA.md** - Referencia técnica detallada
4. **RESUMEN_CAMBIOS.md** - Resumen de cambios
5. **GUIA_INICIO_RAPIDO.md** - Este archivo

---

## ⚡ Inicio Rápido (30 segundos)

### 1️⃣ **Ya Funciona Automáticamente**

```typescript
// Simplemente navega a "Gestión"
setSection("gestion");

// Los grupos se cargan automáticamente
// Ver consola: "✓ Grupos autenticados cargados: X grupos"
```

### 2️⃣ **Ver los Grupos Cargados**

```typescript
// En cualquier parte del componente
console.log(grupos);

// Resultado:
// [
//   { id: '1', name: 'Ing. Sistemas - Grupo A', count: 25, status: 'En curso', ... },
//   { id: '2', name: 'Diseño Gráfico - Grupo B', count: 18, status: 'Completado', ... },
//   ...
// ]
```

### 3️⃣ **Renderiza Automáticamente**

Las tarjetas de grupos se muestran en la sección "Gestión" con:

- Nombre del grupo
- Cantidad de estudiantes
- Estado (con badge de color)
- Tags
- Botones de acción

---

## 📋 Qué Hace la Función

```
1. Obtiene usuario autenticado ✓
2. Consulta tabla "grupos" en Supabase ✓
3. Obtiene estudiantes de cada grupo ✓
4. Obtiene solicitud de horas asociada ✓
5. Obtiene empresa asignada ✓
6. Mapea estados automáticamente ✓
7. Actualiza el estado "grupos" ✓
8. Renderiza tarjetas con estilos ✓
```

---

## 🎯 Casos de Uso

### ✅ Caso 1: Ver todos los grupos de la universidad

```typescript
// Navega a Gestión
setSection("gestion");

// Se cargan todos los grupos del usuario autenticado
// Se muestran como tarjetas con toda la información
```

### ✅ Caso 2: Acceder a los datos de los grupos

```typescript
// Obtener cantidad de grupos
console.log(`Total: ${grupos.length} grupos`);

// Filtrar grupos activos
const activos = grupos.filter((g) => g.status === "En curso");

// Contar estudiantes totales
const total = grupos.reduce((sum, g) => sum + g.count, 0);
```

### ✅ Caso 3: Buscar un grupo específico

```typescript
const miGrupo = grupos.find((g) => g.name.includes("Sistemas"));
console.log(miGrupo);

// Obtener estudiantes del grupo
console.log(miGrupo.estudiantes);
```

---

## 📊 Datos Obtenidos

Cada grupo cargado contiene:

```typescript
{
  id: "grupo-1",                              // ID único
  name: "Ing. Sistemas - Grupo A",           // Nombre completo
  carrera: "Ingeniería en Sistemas",         // Carrera
  dateCreated: "15/01/2025",                 // Fecha creación
  inicio: "01/02/2025",                      // Fecha inicio
  fin: "15/12/2025",                         // Fecha fin
  count: 25,                                 // Cantidad estudiantes
  status: "En curso",                        // Estado
  badgeType: "inprogress",                   // Tipo de badge
  tags: ["Ingeniería", "aprobada"],          // Etiquetas
  empresaAsignada: "TechSV Solutions",       // Empresa asociada
  estudiantes: [                             // Lista de estudiantes
    {
      id: "est-1",
      name: "Carlos Martínez",
      carrera: "Ing. Sistemas",
      estado: "Activo",
      horas: 120
    },
    // ... más estudiantes
  ]
}
```

---

## 🔍 Dónde Ver los Cambios

### En la Aplicación

1. **Login** como Universidad
2. **Navega** a "Gestión" → "Grupos de estudiantes"
3. **Verás** todas tus tarjetas de grupos

### En el Código

```
app/dashboard-universidad.tsx
  ├─ Línea 954: Nueva función loadGruposAutenticado()
  ├─ Línea 1186: Se llama en useEffect
  └─ Línea 1789+: Se renderiza en renderGestion()
```

### En la Consola

```
✓ Grupos autenticados cargados: 4 grupos
```

---

## 🛠️ Cómo Personalizar

### Cambiar el Ordenamiento

```typescript
// En la función, modificar:
.order("fecha_creacion", { ascending: false }) // Más recientes primero
// Por:
.order("fecha_creacion", { ascending: true })  // Más antiguos primero
```

### Agregar Filtros

```typescript
// Solo grupos activos
.eq("estado", "Activo")

// Solo grupos con empresa asignada
.not("empresa_id", "is", null)
```

### Agregar Búsqueda

```typescript
const buscar = (query: string) => {
  return grupos.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase()),
  );
};

const resultados = buscar("Sistemas");
```

---

## ⚠️ Requisitos

✅ **Obligatorio:**

- Usuario autenticado en Supabase
- Tener la tabla `grupos` en Supabase
- Tener grupos con tu `universidad_id`

✅ **Recomendado:**

- RLS habilitado en Supabase
- Política: `universidad_id = auth.uid()`

---

## 🐛 Troubleshooting

### ❌ Los grupos no aparecen

**Solución 1:** Verifica que estés autenticado

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
console.log(user); // Debe mostrar tu usuario
```

**Solución 2:** Verifica que hay grupos en la BD

```sql
SELECT * FROM grupos WHERE universidad_id = 'tu-id';
-- Si no devuelve nada, crea un grupo primero
```

**Solución 3:** Revisa la consola

```
Abre Developer Tools → Console
Busca mensajes de error
```

---

## 📈 Próximos Pasos

1. **Prueba la función**
   - Navega a "Gestión"
   - Verifica que los grupos aparecen

2. **Revisa la documentación**
   - Lee `GRUPOS_AUTENTICADO_DOCS.md` para más detalles
   - Ve `GRUPOS_EJEMPLOS_USO.md` para ejemplos avanzados

3. **Personaliza si es necesario**
   - Agregar filtros
   - Cambiar ordenamiento
   - Agregar búsqueda

4. **Reporta bugs**
   - Si algo no funciona, revisa la consola
   - Incluye el error exacto en tu reporte

---

## 📚 Documentación Disponible

| Documento                        | Descripción                          |
| -------------------------------- | ------------------------------------ |
| **GRUPOS_AUTENTICADO_DOCS.md**   | Documentación completa de la función |
| **GRUPOS_EJEMPLOS_USO.md**       | 8+ ejemplos prácticos                |
| **GRUPOS_REFERENCIA_TECNICA.md** | Referencia técnica detallada         |
| **RESUMEN_CAMBIOS.md**           | Resumen de todos los cambios         |
| **GUIA_INICIO_RAPIDO.md**        | Este archivo                         |

---

## ✨ Características Principales

✅ **Carga automática** - Se ejecuta al ir a "Gestión"
✅ **Datos actuales** - Desde Supabase en tiempo real
✅ **Mapeo de estados** - Convierte estados automáticamente
✅ **Manejo de errores** - Incluye logging detallado
✅ **Integración seamless** - Funciona con código existente
✅ **Estilos consistentes** - Usa estilos del componente
✅ **Información completa** - Grupos, estudiantes, empresas

---

## 🚀 Ahora Estás Listo

¡La función está lista para usar!

**Próximo paso:** Navega a "Gestión" y verás tus grupos cargados automáticamente. 🎉

---

**¿Dudas?** Consulta los archivos de documentación.  
**¿Problemas?** Revisa la sección Troubleshooting.  
**¿Mejoras?** Ve la sección Cómo Personalizar.

---

Creado: Mayo 25, 2026  
Versión: 1.0  
Status: ✅ Listo para usar
