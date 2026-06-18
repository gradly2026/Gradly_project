import { Redirect } from 'expo-router';
// Estudiantes van a las tabs — no a este dashboard
export default function DashboardEstudianteLegacy() {
  return <Redirect href="/(tabs)" />;
}
