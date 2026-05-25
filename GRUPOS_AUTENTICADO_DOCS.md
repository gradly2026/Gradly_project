# Función `loadGruposAutenticado()` - Documentación

## Descripción General

La función `loadGruposAutenticado()` obtiene y renderiza todos los grupos creados por el usuario autenticado (universidad) directamente desde la base de datos Supabase.

## Ubicación

- **Archivo**: `app/dashboard-universidad.tsx`
- **Líneas**: Aproximadamente líneas 950-1070
- **Se ejecuta automáticamente cuando**: El usuario navega a la sección "Gestión" o "Grupos"

## Características Principales

### 1. **Autenticación Automática**

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
```

- Obtiene el usuario autenticado de Supabase Auth
- Utiliza el `user.id` como `universidad_id` para filtrar grupos

### 2. **Obtención de Datos Múltiples**

La función obtiene información de varias tablas:

- ✅ **Tabla `grupos`**: Información base del grupo
- ✅ **Tabla `estudiantes`**: Cantidad de estudiantes por grupo
- ✅ **Tabla `solicitudes_horas`**: Estado, fechas y empresa asociada
- ✅ **Tabla `empresas`**: Nombre de la empresa asignada

### 3. **Mapeo de Datos**

Convierte los datos de Supabase a la estructura `GrupoData` requerida:

```typescript
interface GrupoData {
  id: string;
  name: string;
  carrera: string;
  dateCreated: string;
  inicio: string;
  fin: string;
  count: number;
  status: string;
  badgeType: "active" | "inprogress" | "completed" | "review" | "rejected";
  tags: string[];
  empresaAsignada: string | null;
  estudiantes: GroupStudent[];
}
```

### 4. **Estados Mapeados**

Los estados de las solicitudes se convierten automáticamente:

| Estado Supabase | Estado Mostrado | Tipo Badge |
| --------------- | --------------- | ---------- |
| `aprobada`      | "En curso"      | inprogress |
| `cerrada`       | "Completado"    | completed  |
| `pendiente`     | "En revisión"   | review     |
| `rechazada`     | "Rechazada"     | rejected   |
| `Activo`        | "Activo"        | active     |

## Flujo de Ejecución

```
Usuario autenticado
        ↓
Navega a sección "Gestion"
        ↓
useEffect dispara loadGruposAutenticado()
        ↓
Obtiene user.id de Supabase Auth
        ↓
Query: SELECT * FROM grupos WHERE universidad_id = user.id
        ↓
Para cada grupo:
  - Obtener estudiantes
  - Obtener solicitud de horas
  - Obtener empresa asignada
        ↓
Mapear datos a estructura GrupoData
        ↓
setGrupos(gruposFiltrados)
        ↓
Renderizar grupos con estilos
```

## Estructura de Datos de Retorno

### Ejemplo de Grupo Cargado

```typescript
{
  id: "grupo-123",
  name: "Ingeniería en Sistemas - Grupo A 2025",
  carrera: "Ingeniería en Sistemas",
  dateCreated: "15/01/2025",
  inicio: "01/02/2025",
  fin: "15/12/2025",
  count: 25,
  status: "En curso",
  badgeType: "inprogress",
  tags: ["Ingeniería en Sistemas", "aprobada"],
  empresaAsignada: "TechSV Solutions",
  estudiantes: [
    {
      id: "est-1",
      name: "Carlos Martínez",
      carrera: "Ingeniería en Sistemas",
      estado: "Activo",
      horas: 120
    },
    // ... más estudiantes
  ]
}
```

## Manejo de Errores

La función incluye manejo completo de errores:

```typescript
// Errores de autenticación
if (!user) {
  console.warn("No authenticated user found");
  return;
}

// Errores de query a Supabase
if (gruposError) {
  console.error("Error cargando grupos autenticados:", gruposError);
  return;
}

// Errores procesando cada grupo
catch (error) {
  console.error("Error procesando grupo:", groupData.id, error);
  return null;
}
```

## Logs de Ejecución

La función imprime un log de éxito cuando termina:

```
✓ Grupos autenticados cargados: 4 grupos
```

## Cómo se Renderiza

Los datos se renderizam usando los estilos proporcionados en `renderGestion()`:

```tsx
<Card key={g.id} style={{ marginBottom: 16 }}>
  <View
    style={[
      s.row,
      {
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 8,
      },
    ]}
  >
    <View style={{ flex: 1, marginRight: 12 }}>
      <Text style={s.grupoName}>{g.name}</Text>
      <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
        Creado el {g.dateCreated} · {g.count} estudiantes
      </Text>
    </View>
    <Badge label={g.status} type={g.badgeType as any} />
  </View>

  <View style={[s.row, { gap: 6, flexWrap: "wrap", marginBottom: 12 }]}>
    {g.tags.map((t) => (
      <Tag key={t} label={t} />
    ))}
  </View>

  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
    <BtnOutline label="Ver grupo" small onPress={() => openGroupViewer(g.id)} />
    <BtnOutline label="Enviar a empresa" small disabled={!g.empresaAsignada} />
    <BtnOutline label="Editar" small onPress={() => openGroupEditor(g)} />
  </View>
</Card>
```

## Tablas de Base de Datos Relacionadas

### Tabla `grupos`

```sql
- id: UUID
- universidad_id: UUID (filtro principal)
- nombre_grupo: VARCHAR
- carrera: VARCHAR
- especialidad: VARCHAR
- fecha_creacion: TIMESTAMP
- created_at: TIMESTAMP
- horas_requeridas: INTEGER
```

### Tabla `solicitudes_horas`

```sql
- id: UUID
- grupo_id: UUID
- empresa_id: UUID
- estado: VARCHAR (aprobada, cerrada, pendiente, rechazada)
- fecha_inicio: DATE
- fecha_fin: DATE
- created_at: TIMESTAMP
```

### Tabla `estudiantes`

```sql
- id: UUID
- grupo_id: UUID
- nombre_completo: VARCHAR
- estado: VARCHAR
```

### Tabla `empresas`

```sql
- id: UUID
- nombre: VARCHAR
```

## Rendimiento

- **Parallelización**: Usa `Promise.all()` para hacer requests en paralelo
- **Ordenamiento**: Los grupos se ordenan por `fecha_creacion` (más recientes primero)
- **Filtrado**: Solo obtiene grupos del usuario autenticado
- **Límites**: Para solicitudes de horas, obtiene solo la más reciente (`.limit(1)`)

## Integración Existente

La función se integra perfectamente con:

- ✅ Sistema de autenticación Supabase existente
- ✅ Estados y hooks React del componente
- ✅ Sistema de estilos `createStyles()`
- ✅ Modales existentes (`GroupDetailModal`, `ProfileViewerModal`)
- ✅ Funciones auxiliares (`formatDateString()`, `openGroupViewer()`)

## Ejemplo de Uso Manual

```typescript
// Llamar manualmente desde cualquier lugar del componente
await loadGruposAutenticado();

// Los grupos se actualizarán en el estado:
console.log(grupos); // Array de GrupoData
```

## Notas Importantes

⚠️ **Requisitos**:

1. El usuario debe estar autenticado en Supabase
2. El usuario debe tener datos en la tabla `universidades`
3. Debe haber grupos con `universidad_id = user.id`

✅ **Ventajas**:

- Datos siempre actualizados desde la BD
- Manejo automático de errores
- Mapeo de estados consistente
- Integración con UI existente

---

## Contacto y Soporte

Para reportar bugs o mejoras, consulta el archivo principal del componente.
