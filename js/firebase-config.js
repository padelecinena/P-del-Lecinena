/* ===========================================================
   CONFIGURACIÓN DE FIREBASE
   ===========================================================
   Sustituye los valores de aquí abajo por los de TU proyecto.
   Los encuentras en:
   Firebase Console → ⚙️ Configuración del proyecto → General
   → apartado "Tus apps" → app web → "Configuración del SDK"

   Estos valores NO son secretos (van en el navegador de todos
   los usuarios); lo que protege tus datos son las Reglas de
   Firestore que configures en la consola. Mira el README.md
   para las instrucciones paso a paso y las reglas recomendadas.
=========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyABIodgUPV5D8PuEq9hswaa0HKT1srfUwo",
  authDomain: "padellecinena.firebaseapp.com",
  projectId: "padellecinena",
  storageBucket: "padellecinena.firebasestorage.app",
  messagingSenderId: "612345587324",
  appId: "1:612345587324:web:5d2873bcae53dca91e4bf9",
};

window.__FIREBASE_CONFIGURED__ = firebaseConfig.apiKey !== "TU_API_KEY";

if(window.__FIREBASE_CONFIGURED__){
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
}
