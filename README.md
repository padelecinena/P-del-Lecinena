# Pádel Leciñena

App web (HTML/CSS/JS puro, sin build) para organizar partidos de pádel y llevar un ranking del grupo. Los datos ahora se guardan en **Firebase Firestore**, así que todo el mundo ve los mismos partidos y el mismo ranking, en tiempo real, desde cualquier dispositivo.

## Qué hace esta versión
- Usuario y contraseña (4-8 números) guardados en la nube, con foto de perfil opcional.
- Pedir partido, apuntarse (4 huecos), hora editable solo por quien lo creó, se cierra al llegar a 4/4.
- Registro de resultado (sets y games) que alimenta el ranking del club.
- Resumen de los últimos partidos jugados en la pantalla principal + historial completo filtrable por jugador.
- **Todo sincronizado en tiempo real entre dispositivos** gracias a Firestore.

## Paso 1: crear tu proyecto de Firebase (gratis)
1. Ve a **https://console.firebase.google.com** e inicia sesión con una cuenta de Google.
2. **Crear un proyecto** → ponle un nombre (p. ej. "padel-lecinena") → puedes desactivar Google Analytics, no hace falta → **Crear proyecto**.
3. En el menú de la izquierda, entra en **Compilación → Firestore Database** → **Crear base de datos**.
   - Elige una ubicación (por ejemplo `eur3 (europe-west)` para estar cerca de España).
   - Selecciona **Empezar en modo de prueba** (esto te da unas reglas abiertas durante 30 días; en el paso 3 las cambiamos por unas permanentes).
4. Vuelve a la página principal del proyecto (icono de la casa) → pulsa el icono **`</>`** ("Añadir app" → Web) → dale un nombre a la app → **Registrar app**.
5. Firebase te mostrará un bloque `firebaseConfig = {...}`. Copia esos valores.

## Paso 2: pegar tu configuración en el proyecto
Abre el archivo `js/firebase-config.js` de este proyecto y sustituye los valores de ejemplo por los tuyos:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "...",
  appId: "1:...:web:...",
};
```

Estos datos no son secretos (van en el navegador de todo el mundo); lo que protege tu base de datos son las **reglas de Firestore** del paso 3.

## Paso 3: reglas de Firestore recomendadas
En la consola de Firebase → **Firestore Database → Reglas**, pega esto y publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{usuario} {
      allow read: if true;
      allow write: if true; // ver nota de seguridad más abajo
    }
    match /partidos/{partido} {
      allow read, write: if true;
    }
  }
}
```

> **Nota de seguridad:** la app usa un usuario/contraseña propios (no Firebase Authentication), así que no hay forma de que Firestore compruebe "de verdad" quién eres. Estas reglas dejan la base de datos abierta a cualquiera que conozca la URL del proyecto — asumible para un grupo de amigos, pero no para datos sensibles. Si en el futuro quieres cerrarlo del todo, el siguiente paso natural es migrar a Firebase Authentication (login real) y unas reglas que solo dejen a cada usuario escribir sus propios datos.

## Paso 4: desplegar en Vercel
1. Sube esta carpeta (o el contenido del zip) como un nuevo proyecto en Vercel.
2. Es un sitio estático: no hace falta build command ni framework preset (elige "Other").
3. Output directory: la raíz del proyecto.
4. Recuerda haber editado `js/firebase-config.js` **antes** de subir el proyecto (o edítalo después y vuelve a desplegar).

Si abres la app y `js/firebase-config.js` sigue con los valores de ejemplo, verás un aviso en pantalla pidiéndote que lo configures — es normal, sigue el Paso 1 y 2.

## Cómo verlo en local
Abre `index.html` en el navegador directamente, o sirve la carpeta con cualquier servidor estático (por ejemplo `npx serve .`). Necesitas conexión a internet porque los datos viven en Firestore.
