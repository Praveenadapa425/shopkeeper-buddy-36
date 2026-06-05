import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "te";

type Dict = Record<string, string>;

const en: Dict = {
  app_name: "Shop Inventory",
  tagline: "Manage your shop stock easily",
  login: "Log in",
  logout: "Log out",
  email: "Email",
  password: "Password",
  signup: "Create account",
  signup_hint: "First sign-up becomes Admin. Second becomes Shop Owner.",
  sign_in_to_continue: "Sign in to continue",
  dashboard: "Dashboard",
  products: "Products",
  add_product: "Add product",
  edit_product: "Edit product",
  settings: "Settings",
  search: "Search products...",
  all_categories: "All categories",
  category: "Category",
  name: "Product name",
  stock: "Stock",
  selling_price: "Selling price",
  cost_price: "Cost price",
  low_stock_threshold: "Low stock alert at",
  image: "Product photo",
  take_photo: "Take photo",
  choose_photo: "Choose photo",
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  confirm_delete: "Delete this product?",
  total_products: "Total products",
  total_stock: "Total stock",
  inventory_value: "Inventory value",
  estimated_profit: "Estimated profit",
  show_cost_price: "Show cost price",
  hide_cost_price: "Hide cost price",
  enter_admin_pin: "Enter 4-digit Admin PIN",
  wrong_pin: "Wrong PIN. Try again.",
  set_admin_pin: "Set Admin PIN",
  current_pin: "Current PIN (leave empty if first time)",
  new_pin: "New 4-digit PIN",
  pin_saved: "PIN saved",
  language: "Language",
  english: "English",
  telugu: "తెలుగు",
  out_of_stock: "Out of stock",
  low_stock: "Low stock",
  in_stock: "In stock",
  no_products: "No products yet. Add your first product.",
  none: "Uncategorized",
  new_category: "New category…",
  loading: "Loading…",
  saved: "Saved",
  error: "Something went wrong",
  units: "units",
  hidden: "••••",
  admin: "Admin",
  owner: "Shop Owner",
  app_settings: "App settings",
  install_hint: "Tip: Open the menu in your browser and tap \"Add to Home screen\" to install.",
  product_details: "Product details",
  view: "View",
  edit: "Edit",
  status: "Status",
};

const te: Dict = {
  app_name: "షాప్ ఇన్వెంటరీ",
  tagline: "మీ షాప్ సరుకును సులభంగా నిర్వహించండి",
  login: "లాగిన్",
  logout: "లాగ్ అవుట్",
  email: "ఇమెయిల్",
  password: "పాస్‌వర్డ్",
  signup: "ఖాతా సృష్టించండి",
  signup_hint: "మొదటి సైన్అప్ అడ్మిన్ అవుతుంది. రెండవది షాప్ యజమాని.",
  sign_in_to_continue: "కొనసాగించడానికి సైన్ ఇన్ చేయండి",
  dashboard: "డాష్‌బోర్డ్",
  products: "ఉత్పత్తులు",
  add_product: "ఉత్పత్తి జోడించండి",
  edit_product: "ఉత్పత్తిని సవరించండి",
  settings: "సెట్టింగ్‌లు",
  search: "ఉత్పత్తులను శోధించండి...",
  all_categories: "అన్ని వర్గాలు",
  category: "వర్గం",
  name: "ఉత్పత్తి పేరు",
  stock: "నిల్వ",
  selling_price: "అమ్మకం ధర",
  cost_price: "కొనుగోలు ధర",
  low_stock_threshold: "తక్కువ నిల్వ హెచ్చరిక",
  image: "ఉత్పత్తి ఫోటో",
  take_photo: "ఫోటో తీయండి",
  choose_photo: "ఫోటో ఎంచుకోండి",
  save: "సేవ్ చేయండి",
  cancel: "రద్దు చేయండి",
  delete: "తొలగించండి",
  confirm_delete: "ఈ ఉత్పత్తిని తొలగించాలా?",
  total_products: "మొత్తం ఉత్పత్తులు",
  total_stock: "మొత్తం నిల్వ",
  inventory_value: "ఇన్వెంటరీ విలువ",
  estimated_profit: "అంచనా లాభం",
  show_cost_price: "కొనుగోలు ధర చూపించు",
  hide_cost_price: "కొనుగోలు ధర దాచు",
  enter_admin_pin: "4-అంకెల అడ్మిన్ పిన్ నమోదు చేయండి",
  wrong_pin: "తప్పు పిన్. మళ్ళీ ప్రయత్నించండి.",
  set_admin_pin: "అడ్మిన్ పిన్ సెట్ చేయండి",
  current_pin: "ప్రస్తుత పిన్ (మొదటిసారి అయితే ఖాళీగా ఉంచండి)",
  new_pin: "కొత్త 4-అంకెల పిన్",
  pin_saved: "పిన్ సేవ్ చేయబడింది",
  language: "భాష",
  english: "English",
  telugu: "తెలుగు",
  out_of_stock: "నిల్వ లేదు",
  low_stock: "తక్కువ నిల్వ",
  in_stock: "నిల్వలో",
  no_products: "ఇంకా ఉత్పత్తులు లేవు. మీ మొదటి ఉత్పత్తిని జోడించండి.",
  none: "వర్గం లేదు",
  new_category: "కొత్త వర్గం…",
  loading: "లోడ్ అవుతోంది…",
  saved: "సేవ్ చేయబడింది",
  error: "ఏదో తప్పు జరిగింది",
  units: "యూనిట్లు",
  hidden: "••••",
  admin: "అడ్మిన్",
  owner: "షాప్ యజమాని",
  app_settings: "యాప్ సెట్టింగ్‌లు",
  install_hint: "చిట్కా: మీ బ్రౌజర్ మెనూ తెరిచి \"హోమ్ స్క్రీన్‌కి జోడించు\" నొక్కండి.",
  product_details: "ఉత్పత్తి వివరాలు",
  view: "చూడండి",
  edit: "సవరించండి",
  status: "స్థితి",
};

const dicts: Record<Lang, Dict> = { en, te };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof en) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (stored === "en" || stored === "te") setLangState(stored);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };
  const t = (k: keyof typeof en) => dicts[lang][k] ?? dicts.en[k] ?? String(k);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
