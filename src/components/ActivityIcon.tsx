import {
  Apple,
  Baby,
  Bath,
  BedDouble,
  BookOpen,
  Droplets,
  Footprints,
  HeartPulse,
  Milk,
  Moon,
  Music,
  Pill,
  Sparkles,
  Stethoscope,
  Sun,
  Syringe,
  Thermometer,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export const customActivityIcons = [
  { key: "heart-pulse", label: "Care", hebrewLabel: "טיפול", icon: HeartPulse },
  { key: "stethoscope", label: "Stethoscope", hebrewLabel: "סטטוסקופ", icon: Stethoscope },
  { key: "pill", label: "Medicine", hebrewLabel: "תרופה", icon: Pill },
  { key: "syringe", label: "Injection", hebrewLabel: "זריקה", icon: Syringe },
  { key: "thermometer", label: "Temperature", hebrewLabel: "טמפרטורה", icon: Thermometer },
  { key: "bath", label: "Bath", hebrewLabel: "אמבטיה", icon: Bath },
  { key: "bed", label: "Sleep", hebrewLabel: "שינה", icon: BedDouble },
  { key: "baby", label: "Baby", hebrewLabel: "תינוק", icon: Baby },
  { key: "milk", label: "Milk", hebrewLabel: "חלב", icon: Milk },
  { key: "apple", label: "Food", hebrewLabel: "אוכל", icon: Apple },
  { key: "sun", label: "Morning", hebrewLabel: "בוקר", icon: Sun },
  { key: "moon", label: "Night", hebrewLabel: "לילה", icon: Moon },
  { key: "footprints", label: "Walk", hebrewLabel: "טיול", icon: Footprints },
  { key: "book", label: "Story", hebrewLabel: "סיפור", icon: BookOpen },
  { key: "music", label: "Music", hebrewLabel: "מוזיקה", icon: Music },
  { key: "sparkles", label: "Milestone", hebrewLabel: "אבן דרך", icon: Sparkles },
] as const;

const customIconByKey = new Map<string, LucideIcon>(
  customActivityIcons.map(({ key, icon }) => [key, icon]),
);

export function ActivityIcon({
  kind,
  icon,
  size = 17,
}: {
  kind: "feeding" | "diaper" | "custom";
  icon?: string;
  size?: number;
}) {
  const Icon = kind === "feeding"
    ? Utensils
    : kind === "diaper"
      ? Droplets
      : customIconByKey.get(icon ?? "heart-pulse") ?? HeartPulse;
  return <Icon size={size} />;
}
