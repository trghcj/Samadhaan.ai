import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "Report Issue": "Report Issue",
      "Operator Dashboard": "Operator Dashboard",
      "My Dashboard": "My Dashboard",
      "Login / Register": "Login / Register",
      "Logout": "Logout",
      "Language": "Language",
      "Welcome to Samadhaan": "Welcome to Samadhaan",
      "Sign in or create an account to track your reports.": "Sign in or create an account to track your reports.",
      "Email Address": "Email Address",
      "Password": "Password",
      "Sign In": "Sign In",
      "Sign Up": "Sign Up",
      "Continue with Google": "Continue with Google"
    }
  },
  hi: {
    translation: {
      "Report Issue": "समस्या दर्ज करें",
      "Operator Dashboard": "ऑपरेटर डैशबोर्ड",
      "My Dashboard": "मेरा डैशबोर्ड",
      "Login / Register": "लॉगिन / रजिस्टर",
      "Logout": "लॉग आउट",
      "Language": "भाषा",
      "Welcome to Samadhaan": "समाधान में आपका स्वागत है",
      "Sign in or create an account to track your reports.": "अपनी रिपोर्ट ट्रैक करने के लिए साइन इन करें या खाता बनाएं।",
      "Email Address": "ईमेल पता",
      "Password": "पासवर्ड",
      "Sign In": "साइन इन",
      "Sign Up": "साइन अप",
      "Continue with Google": "Google के साथ जारी रखें"
    }
  },
  bn: {
    translation: {
      "Report Issue": "সমস্যা রিপোর্ট করুন",
      "Operator Dashboard": "অপারেটর ড্যাশবোর্ড",
      "My Dashboard": "আমার ড্যাশবোর্ড",
      "Login / Register": "লগইন / নিবন্ধন",
      "Logout": "লগআউট",
      "Language": "ভাষা",
      "Welcome to Samadhaan": "সমাধানে স্বাগতম",
      "Sign in or create an account to track your reports.": "আপনার রিপোর্ট ট্র্যাক করতে সাইন ইন করুন বা একটি অ্যাকাউন্ট তৈরি করুন।",
      "Email Address": "ইমেইল ঠিকানা",
      "Password": "পাসওয়ার্ড",
      "Sign In": "সাইন ইন করুন",
      "Sign Up": "নিবন্ধন করুন",
      "Continue with Google": "Google এর সাথে চালিয়ে যান"
    }
  },
  te: {
    translation: {
      "Report Issue": "సమస్యను నివేదించండి",
      "Operator Dashboard": "ఆపరేటర్ డాష్‌బోర్డ్",
      "My Dashboard": "నా డాష్‌బోర్డ్",
      "Login / Register": "లాగిన్ / రిజిస్టర్",
      "Logout": "లాగ్ అవుట్",
      "Language": "భాష",
      "Welcome to Samadhaan": "సమాధాన్‌కు స్వాగతం",
      "Sign in or create an account to track your reports.": "మీ నివేదికలను ట్రాక్ చేయడానికి సైన్ ఇన్ చేయండి లేదా ఖాతాను సృష్టించండి.",
      "Email Address": "ఇమెయిల్ చిరునామా",
      "Password": "పాస్‌వర్డ్",
      "Sign In": "సైన్ ఇన్",
      "Sign Up": "సైన్ అప్",
      "Continue with Google": "Google తో కొనసాగించండి"
    }
  },
  ta: {
    translation: {
      "Report Issue": "சிக்கலை புகாரளிக்கவும்",
      "Operator Dashboard": "ஆபரேட்டர் டாஷ்போர்டு",
      "My Dashboard": "என் டாஷ்போர்டு",
      "Login / Register": "உள்நுழை / பதிவு செய்",
      "Logout": "வெளியேறு",
      "Language": "மொழி",
      "Welcome to Samadhaan": "சமாதானுக்கு வரவேற்கிறோம்",
      "Sign in or create an account to track your reports.": "உங்கள் புகார்களைக் கண்காணிக்க உள்நுழையவும் அல்லது கணக்கை உருவாக்கவும்.",
      "Email Address": "மின்னஞ்சல் முகவரி",
      "Password": "கடவுச்சொல்",
      "Sign In": "உள்நுழை",
      "Sign Up": "பதிவு செய்",
      "Continue with Google": "Google உடன் தொடர்க"
    }
  },
  mr: {
    translation: {
      "Report Issue": "समस्या नोंदवा",
      "Operator Dashboard": "ऑपरेटर डॅशबोर्ड",
      "My Dashboard": "माझा डॅशबोर्ड",
      "Login / Register": "लॉगिन / नोंदणी करा",
      "Logout": "लॉग आउट",
      "Language": "भाषा",
      "Welcome to Samadhaan": "समाधान मध्ये आपले स्वागत आहे",
      "Sign in or create an account to track your reports.": "तुमचे अहवाल ट्रॅक करण्यासाठी साइन इन करा किंवा खाते तयार करा.",
      "Email Address": "ईमेल पत्ता",
      "Password": "पासवर्ड",
      "Sign In": "साइन इन",
      "Sign Up": "साइन अप",
      "Continue with Google": "Google सह सुरू ठेवा"
    }
  },
  es: {
    translation: {
      "Report Issue": "Reportar Problema",
      "Operator Dashboard": "Panel de Operador",
      "My Dashboard": "Mi Panel",
      "Login / Register": "Iniciar Sesión / Registrarse",
      "Logout": "Cerrar Sesión",
      "Language": "Idioma",
      "Welcome to Samadhaan": "Bienvenido a Samadhaan",
      "Sign in or create an account to track your reports.": "Inicia sesión o crea una cuenta para rastrear tus reportes.",
      "Email Address": "Correo Electrónico",
      "Password": "Contraseña",
      "Sign In": "Iniciar Sesión",
      "Sign Up": "Registrarse",
      "Continue with Google": "Continuar con Google"
    }
  },
  fr: {
    translation: {
      "Report Issue": "Signaler un problème",
      "Operator Dashboard": "Tableau de bord Opérateur",
      "My Dashboard": "Mon tableau de bord",
      "Login / Register": "Connexion / Inscription",
      "Logout": "Déconnexion",
      "Language": "Langue",
      "Welcome to Samadhaan": "Bienvenue sur Samadhaan",
      "Sign in or create an account to track your reports.": "Connectez-vous ou créez un compte pour suivre vos signalements.",
      "Email Address": "Adresse Email",
      "Password": "Mot de passe",
      "Sign In": "Se connecter",
      "Sign Up": "S'inscrire",
      "Continue with Google": "Continuer avec Google"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
