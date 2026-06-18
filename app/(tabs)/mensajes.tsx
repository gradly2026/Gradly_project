import { StatusBar } from "expo-status-bar";
import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import InboxList from "../../src/components/InboxList";

/** Bandeja de entrada como pestaña inferior (Estudiantes). */
export default function MensajesTab() {
  return (
    <LiquidBackground>
      <StatusBar style="light" />
      <InboxList />
    </LiquidBackground>
  );
}
