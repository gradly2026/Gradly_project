# Ejemplos de Uso - `loadGruposAutenticado()`

## 1. Uso Automático (Recomendado)

La función se ejecuta automáticamente cuando navegas a la sección "Gestión":

```typescript
// En el componente DashboardUniversidad
// Simplemente establece la sección a "gestion"
setSection("gestion");

// Automáticamente se ejecutará:
// - loadGruposDb()
// - loadGruposAutenticado() ← Nueva función
```

---

## 2. Uso Manual desde un Botón

```typescript
const handleRefreshGrupos = async () => {
  console.log("Recargando grupos...");
  await loadGruposAutenticado();
  Alert.alert("Éxito", "Grupos recargados correctamente");
};

// En tu JSX:
<BtnPrimary
  label="🔄 Recargar Grupos"
  onPress={handleRefreshGrupos}
/>
```

---

## 3. Acceso a los Datos Cargados

```typescript
// Los datos cargados están en el estado `grupos`
console.log(grupos); // Array<GrupoData>

// Iterar sobre los grupos
grupos.forEach((grupo) => {
  console.log(`Grupo: ${grupo.name}`);
  console.log(`  - Estudiantes: ${grupo.count}`);
  console.log(`  - Estado: ${grupo.status}`);
  console.log(`  - Empresa: ${grupo.empresaAsignada || "Sin asignar"}`);
});
```

---

## 4. Filtrar Grupos Después de Cargar

```typescript
// Obtener solo grupos completados
const gruposCompletados = grupos.filter((g) => g.badgeType === "completed");

// Obtener grupos con empresa asignada
const gruposConEmpresa = grupos.filter((g) => g.empresaAsignada !== null);

// Obtener grupos activos
const gruposActivos = grupos.filter((g) => g.status === "En curso");
```

---

## 5. Buscar un Grupo por ID

```typescript
const obtenerGrupo = (grupoId: string) => {
  return grupos.find((g) => g.id === grupoId);
};

// Uso:
const mi_grupo = obtenerGrupo("grupo-123");
if (mi_grupo) {
  console.log(`Encontrado: ${mi_grupo.name}`);
}
```

---

## 6. Contar Estadísticas

```typescript
// Total de grupos
console.log(`Total de grupos: ${grupos.length}`);

// Total de estudiantes
const totalEstudiantes = grupos.reduce((sum, g) => sum + g.count, 0);
console.log(`Total de estudiantes: ${totalEstudiantes}`);

// Grupos por estado
const estadisticas = {
  activos: grupos.filter((g) => g.status === "En curso").length,
  completados: grupos.filter((g) => g.status === "Completado").length,
  enRevision: grupos.filter((g) => g.status === "En revisión").length,
  rechazados: grupos.filter((g) => g.status === "Rechazada").length,
};
console.log(estadisticas);
```

---

## 7. Obtener Estudiantes de un Grupo

```typescript
const obtenerEstudiantesGrupo = (grupoId: string) => {
  const grupo = grupos.find((g) => g.id === grupoId);
  return grupo?.estudiantes ?? [];
};

// Uso:
const estudiantes = obtenerEstudiantesGrupo("grupo-123");
estudiantes.forEach((est) => {
  console.log(`${est.name} - ${est.estado}`);
});
```

---

## 8. Verificar si una Universidad Tiene Grupos

```typescript
const tienGrupos = grupos.length > 0;

if (tienGrupos) {
  console.log("La universidad tiene grupos");
} else {
  console.log("La universidad no tiene grupos creados");
}
```

---

## Troubleshooting

### ❌ Los grupos no cargan

**Causa 1: Usuario no autenticado**

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  console.error("Usuario no autenticado");
  // Redirigir a login
  return;
}
```

**Causa 2: Revisar permisos en Supabase RLS**

```sql
-- Verificar que el usuario puede leer la tabla grupos
SELECT * FROM grupos WHERE universidad_id = auth.uid();
```

**Causa 3: No hay datos en la tabla**

```typescript
// Verificar en la consola
console.log("Grupos cargados:", grupos.length);

// Si es 0, significa que no hay grupos para este usuario
if (grupos.length === 0) {
  console.log("No hay grupos. Crea uno primero.");
}
```

---

### ⚠️ Los datos están incompletos

**Revisar logs de error**

```typescript
// La función imprime errores en consola
// Abre la consola de React Native:
// - Android: adb logcat
// - iOS: Xcode console
// - Expo: Expo go terminal
```

---

### 🔄 Necesitas recargar después de crear un grupo

```typescript
const handleGrupoCreado = () => {
  // Después de crear un grupo, recarga la lista
  loadGruposAutenticado();
};
```

---

## Casos de Uso Reales

### Caso 1: Mostrar Resumen en Dashboard

```typescript
const renderGruposResumen = () => {
  const active = grupos.filter(g => g.status === "En curso").length;
  const completed = grupos.filter(g => g.status === "Completado").length;
  const pendientes = grupos.filter(g => g.status === "En revisión").length;

  return (
    <View>
      <Text>Total: {grupos.length}</Text>
      <Text>Activos: {active}</Text>
      <Text>Completados: {completed}</Text>
      <Text>Pendientes: {pendientes}</Text>
    </View>
  );
};
```

---

### Caso 2: Exportar Datos a CSV

```typescript
const exportarGruposCSV = () => {
  let csv = "Nombre,Carrera,Estudiantes,Estado,Empresa\n";

  grupos.forEach((g) => {
    const row = `"${g.name}","${g.carrera}",${g.count},"${g.status}","${g.empresaAsignada || "N/A"}"\n`;
    csv += row;
  });

  // Guardar o enviar csv
  console.log(csv);
};
```

---

### Caso 3: Validación Antes de Enviar a Empresa

```typescript
const puedeEnviarAEmpresa = (grupoId: string) => {
  const grupo = grupos.find((g) => g.id === grupoId);
  if (!grupo) return false;

  // Solo si el grupo tiene empresa asignada
  if (!grupo.empresaAsignada) return false;

  // Y tiene al menos 1 estudiante
  if (grupo.count === 0) return false;

  return true;
};
```

---

## Monitoreo en Tiempo Real

Para obtener datos actualizados en tiempo real, puedes usar subscripciones de Supabase:

```typescript
// (Opcional) Escuchar cambios en grupos
const subscribeToGroupChanges = () => {
  const subscription = supabase
    .channel("public:grupos")
    .on("*", { event: "*", schema: "public", table: "grupos" }, (payload) => {
      console.log("Cambio en grupos:", payload);
      // Recargar grupos aquí
      loadGruposAutenticado();
    })
    .subscribe();

  return subscription;
};
```

---

## Integración con Redux/Context (Opcional)

Si quieres compartir los datos con otros componentes:

```typescript
// En un context o store
const [gruposGlobal, setGruposGlobal] = useState<GrupoData[]>([]);

// Después de cargar
setGruposGlobal(gruposFiltrados);

// En otros componentes
const { gruposGlobal } = useContext(GruposContext);
```

---

## Performance Tips

1. **Cachear datos**: Guarda los grupos en AsyncStorage

```typescript
const guardarEnCache = async (grupos: GrupoData[]) => {
  await AsyncStorage.setItem("grupos_cache", JSON.stringify(grupos));
};
```

2. **Paginar resultados**: Si hay muchos grupos

```typescript
const ITEMS_POR_PAGINA = 10;
const gruposPaginados = grupos.slice(0, ITEMS_POR_PAGINA);
```

3. **Memoizar cálculos**:

```typescript
const estadisticas = useMemo(() => {
  return {
    total: grupos.length,
    activos: grupos.filter((g) => g.status === "En curso").length,
  };
}, [grupos]);
```

---

## Soporte y Debugging

Si necesitas más ayuda, habilita logging detallado:

```typescript
const loadGruposAutenticado = async (DEBUG = true) => {
  if (DEBUG) console.log("🔄 Iniciando loadGruposAutenticado...");

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (DEBUG) console.log("👤 Usuario:", user?.id);

    // ... resto del código

    if (DEBUG) console.log("✅ Carga completada:", gruposFiltrados.length);
  } catch (error) {
    if (DEBUG) console.error("❌ Error:", error);
  }
};
```
