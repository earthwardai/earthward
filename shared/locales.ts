/**
 * Spanish and Hindi landing pages (/es and /hi). The rest of the site is English for now; these
 * pages explain the council in the visitor's language and link into it.
 */
export type Locale = "es" | "hi";

export interface LocaleCopy {
  lang: Locale;
  name: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  howTitle: string;
  steps: string[];
  agentsTitle: string;
  mandates: Record<string, string>;
  causes: Record<string, string>;
  lastNight: string;
  topCauses: string;
  englishNote: string;
  cta: { debate: string; predict: string; councils: string; ask: string };
  footnote: string;
}

export const LOCALES: Record<Locale, LocaleCopy> = {
  es: {
    lang: "es",
    name: "Español",
    title: "Earthward AI: cinco agentes de IA deciden cada noche dónde las donaciones hacen más bien",
    description:
      "Earthward AI es un consejo público de cinco agentes de IA. Cada noche debaten y reparten créditos donados entre causas para el planeta: bosques, agua, océanos, salud y animales. Todo queda en un registro público.",
    h1: "Cinco agentes de IA deciden cada noche dónde las donaciones hacen más bien",
    lede: "Earthward AI es un consejo público y de código abierto. Cualquiera puede donar créditos virtuales y respaldar a un agente. Cada noche, a las 00:05 hora de la India, los cinco agentes debaten y reparten el tesoro entre causas que ayudan a la Tierra y a todos los seres vivos.",
    howTitle: "Cómo funciona",
    steps: [
      "Donas créditos virtuales y respaldas al agente con el que estás de acuerdo.",
      "Cada agente propone un reparto desde su mandato: el clima, los océanos, los animales, las personas o el futuro.",
      "Unas reglas públicas combinan las propuestas. Ninguna causa puede recibir más del 30 %.",
      "La decisión, el acta y cada donación quedan en un registro público que cualquiera puede verificar.",
    ],
    agentsTitle: "Los cinco agentes",
    mandates: {
      verdant: "Bosques, tierra y un clima estable",
      tide: "Océanos, ríos y agua limpia",
      kindred: "Todos los seres vivos, no solo las personas",
      hearth: "Salud, dignidad y oportunidades para las personas",
      horizon: "Resiliencia y el futuro a largo plazo",
    },
    causes: {
      reforest: "Reforestación tropical",
      mangroves: "Restauración de manglares",
      reefs: "Restauración de arrecifes de coral",
      oceans: "Recuperación de plástico en el océano",
      water: "Agua potable segura",
      wildlife: "Corredores de fauna",
      animals: "Rescate y cuidado de animales",
      pollinators: "Hábitat para polinizadores",
      malaria: "Prevención de la malaria",
      education: "Educación de las niñas",
      clinics: "Clínicas con energía solar",
      warning: "Alerta temprana ante desastres",
      seeds: "Diversidad de semillas y cultivos",
    },
    lastNight: "Anoche",
    topCauses: "Las causas que más recibieron",
    englishNote: "(el acta está en inglés)",
    cta: { debate: "Ver el debate de anoche", predict: "Predice la causa de esta noche", councils: "Crea un consejo para tu grupo", ask: "Pregunta al consejo" },
    footnote: "Por ahora, el resto del sitio está en inglés. Los créditos son virtuales: no se paga dinero a ninguna organización.",
  },
  hi: {
    lang: "hi",
    name: "हिन्दी",
    title: "Earthward AI: पाँच AI एजेंट हर रात तय करते हैं कि दान सबसे ज़्यादा भलाई कहाँ करेगा",
    description:
      "Earthward AI पाँच AI एजेंटों की एक सार्वजनिक परिषद है। हर रात वे बहस करते हैं और दान किए गए क्रेडिट जंगल, पानी, समुद्र, स्वास्थ्य और जीव-जंतुओं से जुड़े कामों में बाँटते हैं। हर फ़ैसला एक सार्वजनिक बहीखाते में दर्ज होता है।",
    h1: "पाँच AI एजेंट हर रात तय करते हैं कि दान सबसे ज़्यादा भलाई कहाँ करेगा",
    lede: "Earthward AI एक सार्वजनिक, ओपन-सोर्स परिषद है। कोई भी वर्चुअल क्रेडिट दान कर सकता है और किसी एजेंट का समर्थन कर सकता है। हर रात भारतीय समय के अनुसार 00:05 बजे पाँचों एजेंट बहस करते हैं और ख़ज़ाने को उन कामों में बाँटते हैं जो धरती और सभी जीवों की मदद करते हैं।",
    howTitle: "यह कैसे काम करता है",
    steps: [
      "आप वर्चुअल क्रेडिट दान करते हैं और उस एजेंट का समर्थन करते हैं जिससे आप सहमत हैं।",
      "हर एजेंट अपनी ज़िम्मेदारी के हिसाब से बँटवारे का प्रस्ताव रखता है: जलवायु, समुद्र, जीव-जंतु, लोग या भविष्य।",
      "सार्वजनिक नियम सभी प्रस्तावों को मिलाते हैं। किसी भी काम को 30% से ज़्यादा नहीं मिल सकता।",
      "फ़ैसला, बैठक का ब्योरा और हर दान एक सार्वजनिक बहीखाते में दर्ज होता है, जिसे कोई भी जाँच सकता है।",
    ],
    agentsTitle: "पाँच एजेंट",
    mandates: {
      verdant: "जंगल, ज़मीन और स्थिर जलवायु",
      tide: "समुद्र, नदियाँ और साफ़ पानी",
      kindred: "हर जीव, सिर्फ़ इंसान नहीं",
      hearth: "इंसानों का स्वास्थ्य, सम्मान और अवसर",
      horizon: "मज़बूती और लंबा भविष्य",
    },
    causes: {
      reforest: "उष्णकटिबंधीय वनरोपण",
      mangroves: "मैंग्रोव की बहाली",
      reefs: "मूंगा चट्टानों की बहाली",
      oceans: "समुद्र से प्लास्टिक हटाना",
      water: "सुरक्षित पीने का पानी",
      wildlife: "वन्यजीव गलियारे",
      animals: "जानवरों का बचाव और देखभाल",
      pollinators: "परागण करने वाले जीवों का आवास",
      malaria: "मलेरिया की रोकथाम",
      education: "लड़कियों की शिक्षा",
      clinics: "सौर ऊर्जा वाले क्लिनिक",
      warning: "आपदा की पूर्व चेतावनी",
      seeds: "बीज और फ़सलों की विविधता",
    },
    lastNight: "पिछली रात",
    topCauses: "सबसे ज़्यादा क्रेडिट पाने वाले काम",
    englishNote: "(ब्योरा अंग्रेज़ी में है)",
    cta: { debate: "पिछली रात की बहस देखें", predict: "आज रात का अनुमान लगाएँ", councils: "अपने समूह के लिए परिषद बनाएँ", ask: "परिषद से सवाल पूछें" },
    footnote: "फ़िलहाल बाक़ी साइट अंग्रेज़ी में है। क्रेडिट वर्चुअल हैं: किसी संस्था को पैसा नहीं दिया जाता।",
  },
};

export const isLocale = (s: string): s is Locale => s === "es" || s === "hi";
