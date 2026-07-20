import { useLang } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <Button
      data-testid="lang-toggle-btn"
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="gap-2 rounded-full"
    >
      <Languages className="h-4 w-4" strokeWidth={1.5} />
      <span className="font-medium">{lang === "en" ? "العربية" : "English"}</span>
    </Button>
  );
}
