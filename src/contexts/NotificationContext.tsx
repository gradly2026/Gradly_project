import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export type NotifType = 'success' | 'warning' | 'error' | 'info';

export interface AppNotification {
  id:      string;
  tipo:    NotifType;
  titulo:  string;
  mensaje: string;
}

interface NotificationContextValue {
  notification:     AppNotification | null;
  showNotification: (tipo: NotifType, titulo: string, mensaje: string) => void;
  hideNotification: () => void;
}

// ─────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────
const NotificationContext = createContext<NotificationContextValue>({
  notification:     null,
  showNotification: () => {},
  hideNotification: () => {},
});

// ─────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────
export const NotificationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hideNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const showNotification = useCallback(
    (tipo: NotifType, titulo: string, mensaje: string) => {
      clearTimeout(timerRef.current);
      setNotification({ id: Date.now().toString(), tipo, titulo, mensaje });
      timerRef.current = setTimeout(hideNotification, 4000);
    },
    [hideNotification],
  );

  return (
    <NotificationContext.Provider value={{ notification, showNotification, hideNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

/** Hook para mostrar notificaciones desde cualquier componente */
export const useNotification = () => useContext(NotificationContext);
