// Konfigurace Firebase pro sdílené poznámky.
//
// Jak ji získat:
//  1) https://console.firebase.google.com  → Add project (vytvoř projekt)
//  2) Build → Firestore Database → Create database (klidně "test mode")
//  3) Project settings (ozubené kolo) → General → Your apps → Web app (</>) → zaregistruj appku
//  4) Zkopíruj sem hodnoty z vygenerovaného objektu firebaseConfig.
//
// Dokud zůstane apiKey prázdné, poznámky se ukládají jen lokálně v prohlížeči.
// Pozn.: tyto údaje jsou určené pro veřejné použití v prohlížeči (nejde o tajný klíč) –
// bezpečnost se řeší pravidly Firestore, ne skrýváním configu.

export const firebaseConfig = {
  apiKey: "AIzaSyCLU7cH1tXPqnaxVV_-BsSNssl-NU9Pz1I",
  authDomain: "rd-modrice-e9477.firebaseapp.com",
  projectId: "rd-modrice-e9477",
  storageBucket: "rd-modrice-e9477.firebasestorage.app",
  messagingSenderId: "941681195558",
  appId: "1:941681195558:web:3aac10f182e784cdb3c4e7"
};
