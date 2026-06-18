import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebaseConfig";

type UserType = "talento" | "empresa" | "universidad";

interface ProfileViewerProps {
  userId: string;
  userType: UserType;
  onGoBack: () => void;
}

type NormalizedProfile = {
  nombre?: string;
  area?: string;
  universidad?: string;
  telefono?: string;
  email?: string;
  bio?: string;
  descripcion?: string;
  industria?: string;
  web?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  tiktok?: string;
  github?: string;
  fotoPerfilUri?: string;
  fotoLogoUri?: string;
  fotoBannerUri?: string;
  verificado?: boolean;
};

const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  accent: "#8b5cf6",
  purple: "#8b5cf6",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.65)",
  border: "rgba(139,92,246,0.22)",
  green: "#27ae60",
  gray: "rgba(255,255,255,0.18)",
};

function getCollectionName(userType: UserType) {
  if (userType === "talento") return "perfiles_estudiantes";
  if (userType === "empresa") return "perfiles_empresas";
  return "perfiles_universidades";
}

function normalizeProfile(userType: UserType, rawProfile: Record<string, any>) {
  const common = {
    nombre: rawProfile.nombre ?? rawProfile.name,
    telefono: rawProfile.telefono,
    web: rawProfile.web,
    instagram: rawProfile.instagram,
    linkedin: rawProfile.linkedin,
    facebook: rawProfile.facebook,
    tiktok: rawProfile.tiktok,
  };

  if (userType === "talento") {
    return {
      ...common,
      area: rawProfile.area,
      universidad: rawProfile.universidad,
      email: rawProfile.email,
      bio: rawProfile.bio,
      fotoPerfilUri:
        rawProfile.fotoPerfilUri ??
        rawProfile.foto_perfil ??
        rawProfile.foto_perfil_uri,
    };
  }

  if (userType === "empresa") {
    return {
      ...common,
      industria: rawProfile.industria,
      descripcion: rawProfile.descripcion,
      verificado: rawProfile.verificado ?? false,
      email: rawProfile.email_corporativo ?? rawProfile.email,
      fotoLogoUri:
        rawProfile.fotoLogoUri ?? rawProfile.foto_logo ?? rawProfile.logo_url,
      fotoBannerUri:
        rawProfile.fotoBannerUri ??
        rawProfile.foto_banner ??
        rawProfile.banner_url,
    };
  }

  return {
    ...common,
    descripcion: rawProfile.descripcion,
    email: rawProfile.email_institucional,
    fotoLogoUri:
      rawProfile.fotoLogoUri ?? rawProfile.foto_logo ?? rawProfile.logo_url,
    fotoBannerUri:
      rawProfile.fotoBannerUri ??
      rawProfile.foto_banner ??
      rawProfile.banner_url,
  };
}

const FALLBACK_PROFILES: Record<UserType, Record<string, NormalizedProfile>> = {
  talento: {
    "demo-talento-1": {
      nombre: "Carlos Martínez",
      area: "Ingeniería en Sistemas",
      universidad: "UDB",
      telefono: "+503 7000-1234",
      email: "carlos.martinez@example.com",
      bio: "Desarrollador junior con experiencia en React Native y proyectos de innovación.",
    },
  },
  empresa: {
    "demo-empresa-1": {
      nombre: "TechSV Solutions",
      industria: "Tecnología",
      descripcion:
        "Compañía líder en soluciones digitales para la región centroamericana.",
      telefono: "+503 7000-5678",
      email: "contacto@techsv.com",
      web: "https://techsv.solutions",
    },
  },
  universidad: {
    "demo-universidad-1": {
      nombre: "Universidad Digital",
      descripcion:
        "Centro académico con enfoque en innovación, tecnología y emprendimiento.",
      telefono: "+503 7000-9999",
      email: "info@universidaddigital.edu.sv",
      web: "https://universidaddigital.edu.sv",
    },
  },
};

export default function ProfileViewer({
  userId,
  userType,
  onGoBack,
}: ProfileViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NormalizedProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    const col = getCollectionName(userType);
    const effectiveUserId = userId?.trim();

    const applyData = (data: Record<string, any> | null) => {
      if (!mounted) return;
      if (!data) {
        const fallback = FALLBACK_PROFILES[userType]?.[effectiveUserId ?? ""];
        if (fallback) {
          setProfile(fallback);
          setError(null);
        } else {
          setError("No se pudo cargar el perfil. Verifica el ID y los permisos.");
        }
        return;
      }
      setProfile(normalizeProfile(userType, data));
      setError(null);
    };

    if (!effectiveUserId) {
      setLoading(false);
      setError("No se proporcionó un ID de usuario.");
      return;
    }

    setLoading(true);
    setError(null);
    setProfile(null);

    // Lectura en tiempo real con onSnapshot (equivalente Firebase al realtime).
    const unsub = onSnapshot(
      doc(db, col, effectiveUserId),
      (snap) => {
        applyData(snap.exists() ? (snap.data() as Record<string, any>) : null);
        if (mounted) setLoading(false);
      },
      (err) => {
        if (!mounted) return;
        const fallback = FALLBACK_PROFILES[userType]?.[effectiveUserId];
        if (fallback) {
          setProfile(fallback);
          setError(null);
        } else {
          setError(err?.message || "No se pudo cargar el perfil.");
        }
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      unsub();
    };
  }, [userId, userType]);

  const getInitials = (text?: string) => {
    if (!text) return "?";
    return text
      .split(" ")
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  const renderHeader = () => (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
        <Ionicons name="arrow-back" size={22} color={C.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Perfil</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  const renderTalento = () => {
    const imageUri = profile?.fotoPerfilUri;

    return (
      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {getInitials(profile?.nombre)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.profileName}>{profile?.nombre}</Text>
        <Text style={styles.profileMeta}>{profile?.area}</Text>
        {profile?.universidad ? (
          <Text style={styles.profileMeta}>{profile.universidad}</Text>
        ) : null}
        <View style={styles.infoList}>
          {profile?.email ? (
            <Text style={styles.infoText}>?? {profile.email}</Text>
          ) : null}
          {profile?.telefono ? (
            <Text style={styles.infoText}>?? {profile.telefono}</Text>
          ) : null}
          {profile?.bio ? (
            <Text style={styles.infoText}>{profile.bio}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderOrganization = () => {
    const bannerUri = profile?.fotoBannerUri;
    const logoUri = profile?.fotoLogoUri;

    return (
      <View style={styles.profileCard}>
        <View style={styles.bannerContainer}>
          {bannerUri ? (
            <Image source={{ uri: bannerUri }} style={styles.bannerImage} />
          ) : (
            <View style={styles.bannerFallback} />
          )}
          <View style={styles.logoContainer}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>
                  {getInitials(profile?.nombre)}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.orgBody}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName}>{profile?.nombre}</Text>
            {profile?.verificado ? (
              <Ionicons name="checkmark-circle" size={20} color={C.accent} />
            ) : null}
          </View>
          {profile?.industria || profile?.descripcion ? (
            <Text style={styles.profileMeta}>
              {profile.industria || profile.descripcion}
            </Text>
          ) : null}
          {profile?.descripcion ? (
            <Text style={[styles.infoText, { marginTop: 12 }]}>
              {profile.descripcion}
            </Text>
          ) : null}
          <View style={styles.infoList}>
            {profile?.telefono ? (
              <Text style={styles.infoText}>?? {profile.telefono}</Text>
            ) : null}
            {profile?.email ? (
              <Text style={styles.infoText}>?? {profile.email}</Text>
            ) : null}
            {profile?.web ? (
              <Text
                style={styles.linkText}
                onPress={() => {
                  if (profile?.web) {
                    Linking.openURL(profile.web);
                  }
                }}
              >
                🌐 {profile.web}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {renderHeader()}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Cargando perfil...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : userType === "talento" ? (
        renderTalento()
      ) : (
        renderOrganization()
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  profileCard: {
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  avatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: C.accent,
  },
  avatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: C.text,
    fontSize: 32,
    fontWeight: "800",
  },
  bannerContainer: {
    height: 180,
    backgroundColor: "rgba(139,92,246,0.15)",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  bannerFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(139,92,246,0.18)",
  },
  logoContainer: {
    position: "absolute",
    left: "50%",
    bottom: -32,
    width: 88,
    height: 88,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.bg,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transform: [{ translateX: -44 }],
  },
  logoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  logoFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoFallbackText: {
    color: C.text,
    fontSize: 22,
    fontWeight: "800",
  },
  orgBody: {
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  profileName: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  profileMeta: {
    color: C.muted,
    fontSize: 13,
    marginBottom: 8,
  },
  infoList: {
    gap: 10,
    marginTop: 12,
  },
  infoText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    color: C.accent,
    fontSize: 14,
    marginTop: 6,
  },
  loadingWrap: {
    paddingTop: 80,
    alignItems: "center",
  },
  loadingText: {
    color: C.text,
    marginTop: 12,
  },
  errorWrap: {
    paddingTop: 80,
    alignItems: "center",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
