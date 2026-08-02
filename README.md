# Gradly

Plataforma educativa (app móvil **Expo / React Native** + **Firebase**) que conecta
estudiantes, universidades y empresas para gestionar **prácticas laborales**:
publicación de vacantes, grupos de estudiantes, acuerdos de pasantía,
certificación de horas y evaluación mutua.

## Requisitos

- Node.js LTS
- Expo (`npx expo`)

## Empezar

1. Instalar dependencias

   ```bash
   npm install
   ```

2. Iniciar la app

   ```bash
   npx expo start
   ```

Desde la salida podrás abrir la app en un [development build](https://docs.expo.dev/develop/development-builds/introduction/),
un [emulador de Android](https://docs.expo.dev/workflow/android-studio-emulator/),
un [simulador de iOS](https://docs.expo.dev/workflow/ios-simulator/) o
[Expo Go](https://expo.dev/go).

## Estructura

- **app/** — pantallas y rutas (enrutamiento por archivos con `expo-router`).
- **src/** — servicios, componentes, contextos, utilidades y datos.
- **functions/** — Cloud Functions (OTP de login, traducción, etc.).

## Backend

Firebase: **Auth**, **Firestore** y **Storage**. Las reglas de seguridad de
Firestore están en `firestore.rules` (fuente de verdad administrada en la
consola de Firebase).

## Aprender más

- [Documentación de Expo](https://docs.expo.dev/)
- [Enrutamiento con Expo Router](https://docs.expo.dev/router/introduction)
