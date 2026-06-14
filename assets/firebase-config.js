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
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
