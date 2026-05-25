# Referencia Técnica - `loadGruposAutenticado()`

## Firma de la Función

```typescript
const loadGruposAutenticado = async (): Promise<void>
```

---

## Parámetros

**Ninguno** - La función obtiene automáticamente el usuario autenticado.

---

## Valor de Retorno

**void** - No retorna nada, pero actualiza el estado `grupos` del componente.

---

## Dependencias

```typescript
// Librerías externas
import { supabase } from "../lib/supabase";

// Estados locales que modifica
setGrupos: (grupos: GrupoData[]) => void

// Funciones locales que utiliza
formatDateString(value?: string | null): string
```

---

## Flujo de Ejecución Detallado

### Paso 1: Obtener Usuario Autenticado

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  console.warn("No authenticated user found");
  return; // ⬅️ Salida temprana si no hay usuario
}
```

**Qué pasa aquí:**

- Obtiene el usuario actual de Supabase Auth
- Si no existe, logea advertencia y termina la ejecución

---

### Paso 2: Obtener Grupos de la BD

```typescript
const { data: gruposData, error: gruposError } = await supabase
  .from("grupos")
  .select("*")
  .eq("universidad_id", user.id)
  .order("fecha_creacion", { ascending: false });

if (gruposError) {
  console.error("Error cargando grupos autenticados:", gruposError);
  return; // ⬅️ Salida temprana si hay error
}

if (!gruposData || gruposData.length === 0) {
  console.log("No groups found for authenticated user");
  setGrupos([]);
  return; // ⬅️ Salida temprana si no hay datos
}
```

**Consulta SQL equivalente:**

```sql
SELECT * FROM grupos
WHERE universidad_id = $1
ORDER BY fecha_creacion DESC
```

**Variables:**

- `$1` = `user.id` (ID del usuario autenticado)

---

### Paso 3: Procesar Cada Grupo en Paralelo

```typescript
const gruposConDetalles = await Promise.all(
  (gruposData as any[]).map(async (groupData) => {
    // ... procesar cada grupo
  }),
);
```

**Ventaja:** Los grupos se procesan en paralelo, no secuencialmente.

---

### Paso 4: Para Cada Grupo - Obtener Estudiantes

```typescript
const { data: estudiantesData } = await supabase
  .from("estudiantes")
  .select("*")
  .eq("grupo_id", groupData.id);
```

**SQL Equivalente:**

```sql
SELECT * FROM estudiantes WHERE grupo_id = $1
```

---

### Paso 5: Para Cada Grupo - Obtener Solicitud de Horas

```typescript
const { data: solicitudData } = await supabase
  .from("solicitudes_horas")
  .select("*")
  .eq("grupo_id", groupData.id)
  .order("created_at", { ascending: false })
  .limit(1);
```

**SQL Equivalente:**

```sql
SELECT * FROM solicitudes_horas
WHERE grupo_id = $1
ORDER BY created_at DESC
LIMIT 1
```

---

### Paso 6: Para Cada Grupo - Obtener Empresa Asignada

```typescript
if (solicitudData && solicitudData.length > 0) {
  const empresaId = solicitudData[0].empresa_id;
  const { data: empresaData } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", empresaId)
    .single();
  empresaNombre = empresaData?.nombre ?? null;
}
```

**SQL Equivalente:**

```sql
SELECT nombre FROM empresas
WHERE id = $1
LIMIT 1
```

---

### Paso 7: Mapear Estados

```typescript
const estadoRaw = solicitudData?.[0]?.estado ?? "Activo";

const statusMap: Record<string, string> = {
  aprobada: "En curso",
  cerrada: "Completado",
  pendiente: "En revisión",
  rechazada: "Rechazada",
  Activo: "Activo",
};

const badgeTypeMap: Record<string, GrupoData["badgeType"]> = {
  aprobada: "inprogress",
  cerrada: "completed",
  pendiente: "review",
  rechazada: "rejected",
  Activo: "active",
};
```

**Tabla de Conversión:**

| Estado Raw  | Status Mostrado | Badge Type |
| ----------- | --------------- | ---------- |
| "aprobada"  | "En curso"      | inprogress |
| "cerrada"   | "Completado"    | completed  |
| "pendiente" | "En revisión"   | review     |
| "rechazada" | "Rechazada"     | rejected   |
| "Activo"    | "Activo"        | active     |
| _default_   | "Activo"        | active     |

---

### Paso 8: Construir Objeto GrupoData

```typescript
return {
  id: String(groupData.id),
  name: `${groupData.carrera || ""} - ${groupData.nombre_grupo || groupData.nombre || "Grupo sin nombre"}`.trim(),
  carrera: groupData.carrera || "",
  dateCreated: formatDateString(
    groupData.fecha_creacion || groupData.created_at,
  ),
  inicio: solicitudData?.[0]?.fecha_inicio
    ? formatDateString(solicitudData[0].fecha_inicio)
    : "Por definir",
  fin: solicitudData?.[0]?.fecha_fin
    ? formatDateString(solicitudData[0].fecha_fin)
    : "Por definir",
  count: (estudiantesData ?? []).length,
  status: statusMap[estadoRaw] || "Activo",
  badgeType: (badgeTypeMap[estadoRaw] as GrupoData["badgeType"]) || "active",
  tags: [
    groupData.carrera || "",
    solicitudData?.[0]?.estado || "Sin solicitud",
  ].filter(Boolean),
  empresaAsignada: empresaNombre,
  estudiantes: (estudiantesData ?? []).map((student: any) => ({
    id: String(student.id),
    name: student.nombre_completo || "Estudiante sin nombre",
    carrera: groupData.carrera || "",
    estado: student.estado || "Activo",
    horas: groupData.horas_requeridas ?? null,
  })),
} as GrupoData;
```

---

### Paso 9: Manejar Errores por Grupo

```typescript
catch (error) {
  console.error("Error procesando grupo:", groupData.id, error);
  return null; // ⬅️ Retorna null si hay error
}
```

---

### Paso 10: Filtrar Grupos Válidos

```typescript
const gruposFiltrados = gruposConDetalles.filter(
  (g) => g !== null,
) as GrupoData[];
```

**Efecto:**

- Elimina grupos con `null` (aquellos que tuvieron error)
- Mantiene solo grupos procesados exitosamente

---

### Paso 11: Actualizar Estado

```typescript
setGrupos(gruposFiltrados);
```

**Efecto:**

- Actualiza el estado `grupos` del componente
- Dispara re-render automático con los nuevos datos

---

### Paso 12: Log de Éxito

```typescript
console.log(`✓ Grupos autenticados cargados: ${gruposFiltrados.length} grupos`);
```

---

## Manejo de Errores

### Árbol de Decisión

```
¿Usuario autenticado?
├─ NO → console.warn() → return
└─ SÍ ↓

¿Query a grupos sin error?
├─ ERROR → console.error() → return
├─ NO DATA → setGrupos([]) → return
└─ SÍ ↓

¿Procesar cada grupo?
├─ ERROR → console.error() → null (filtrado luego)
└─ ÉXITO → return GrupoData ↓

¿Hay grupos válidos?
├─ SÍ → setGrupos(gruposFiltered) → console.log()
└─ NO → setGrupos([])
```

---

## Complejidad Computacional

### Complejidad de Tiempo

```
O(n * m)

Donde:
n = número de grupos
m = promedio de operaciones por grupo (constante ≈ 3-4 queries)
```

**Ejemplo:**

- 10 grupos → ~30-40 queries
- 100 grupos → ~300-400 queries

### Complejidad de Espacio

```
O(n * k)

Donde:
n = número de grupos
k = promedio de estudiantes por grupo
```

**Ejemplo con 10 grupos de 25 estudiantes:**

```
Total de objetos: 10 + (10 * 25) + 10 + 10 = 260 objetos
```

---

## Limitaciones Conocidas

### 1. **Sin Paginación**

- Carga TODOS los grupos del usuario
- Si hay 1000 grupos, carga todos

**Solución:**

```typescript
const gruposData = await supabase
  .from("grupos")
  .select("*")
  .eq("universidad_id", user.id)
  .range(0, 9) // ⬅️ Agregar paginación
  .order("fecha_creacion", { ascending: false });
```

### 2. **Sin Caché**

- Cada vez que se ejecuta, hace N queries a BD
- No guarda resultados en AsyncStorage

**Solución:**

```typescript
// Antes de hacer queries
const cached = await AsyncStorage.getItem("grupos_cache");
if (cached) {
  setGrupos(JSON.parse(cached));
  return; // Usar caché
}
```

### 3. **Sin Sincronización en Tiempo Real**

- Si otro usuario modifica un grupo, no se actualiza automáticamente

**Solución:**

```typescript
// Usar Realtime de Supabase
supabase
  .channel("public:grupos")
  .on("*", { event: "*" }, (payload) => {
    loadGruposAutenticado(); // Recargar
  })
  .subscribe();
```

---

## Eventos Que Disparan la Función

```typescript
// En el useEffect:
useEffect(() => {
  if (section === "grupos" || section === "gestion") {
    loadGruposDb();
    loadGruposAutenticado(); // ⬅️ Se ejecuta aquí
  }
}, [section]); // ⬅️ Cuando `section` cambia

// Ejemplos:
setSection("gestion"); // ✅ Dispara
setSection("grupos"); // ✅ Dispara
setSection("perfil"); // ❌ No dispara
setSection("inicio"); // ❌ No dispara
```

---

## Integración con Otras Funciones

```
loadGruposAutenticado()
    ↓
   [Carga todos los grupos del usuario]
    ↓
   setGrupos(gruposFiltrados)
    ↓
   [El estado `grupos` se actualiza]
    ↓
   renderGestion() [lee estado `grupos`]
    ↓
   [Renderiza cards con cada grupo]
```

---

## Tipos de Datos Involucrados

### Input (Supabase Response)

```typescript
// Tabla: grupos
{
  id: UUID,
  universidad_id: UUID,
  nombre_grupo: string,
  nombre: string,
  carrera: string,
  especialidad: string,
  fecha_creacion: timestamp,
  created_at: timestamp,
  horas_requeridas: integer,
  [other fields...]
}

// Tabla: estudiantes
{
  id: UUID,
  grupo_id: UUID,
  nombre_completo: string,
  estado: string,
  matricula: string,
  [other fields...]
}

// Tabla: solicitudes_horas
{
  id: UUID,
  grupo_id: UUID,
  empresa_id: UUID,
  estado: varchar,
  fecha_inicio: date,
  fecha_fin: date,
  created_at: timestamp,
  [other fields...]
}

// Tabla: empresas
{
  id: UUID,
  nombre: string,
  [other fields...]
}
```

### Output (estado `grupos`)

```typescript
GrupoData[] = [
  {
    id: string,
    name: string,
    carrera: string,
    dateCreated: string,
    inicio: string,
    fin: string,
    count: number,
    status: string,
    badgeType: "active" | "inprogress" | "completed" | "review" | "rejected",
    tags: string[],
    empresaAsignada: string | null,
    estudiantes: GroupStudent[],
  },
  // ... más grupos
]
```

---

## Monitoreo de Memoria

Para evitar memory leaks:

```typescript
// ✅ Correcto: La función limpia automáticamente
useEffect(() => {
  if (section === "gestion") {
    loadGruposAutenticado();
  }
}, [section]); // Dependencia clara

// ❌ Incorrecto: Podría causar multiple calls
useEffect(() => {
  loadGruposAutenticado();
  // Sin dependencias = corre en cada render
}, []);
```

---

## Testing

### Unit Test (Jest)

```typescript
describe("loadGruposAutenticado", () => {
  it("should load groups for authenticated user", async () => {
    // Mock supabase
    const mockUser = { id: "test-user-id" };
    supabase.auth.getUser = jest
      .fn()
      .resolveValue({ data: { user: mockUser } });

    supabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [{ id: "1", nombre_grupo: "Test" }],
            error: null,
          }),
        }),
      }),
    });

    // Execute
    await loadGruposAutenticado();

    // Assert
    expect(setGrupos).toHaveBeenCalled();
  });
});
```

---

## Documentación Relacionada

- [GRUPOS_AUTENTICADO_DOCS.md](./GRUPOS_AUTENTICADO_DOCS.md) - Guía general
- [GRUPOS_EJEMPLOS_USO.md](./GRUPOS_EJEMPLOS_USO.md) - Ejemplos prácticos
- [dashboard-universidad.tsx](./app/dashboard-universidad.tsx) - Código fuente

---

**Última actualización:** Mayo 25, 2026  
**Versión:** 1.0  
**Estado:** ✅ Producción
