import { ArrowLeft, ArrowRight, ChevronRight, Clock3, Cookie, Eye, FileText, HeartPulse, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { useRef, useState } from "react";
import { FeedmeBrand } from "./components/FeedmeBrand";
import { LanguageControl } from "./components/LanguageControl";
import { LanguagePicker } from "./components/LanguagePicker";

export type PublicPage = "landing" | "about" | "privacy" | "cookies" | "terms" | "security" | "accessibility" | "contact";
type PublicLocale = "en" | "he";

type PublicSiteProps = {
  page: PublicPage;
  locale: PublicLocale;
  onLocale: (locale: PublicLocale) => void;
  onNavigate: (path: string) => void;
  onSignIn: () => void;
};

const pageByPath: Record<Exclude<PublicPage, "landing">, { eyebrow: string; title: string; intro: string; sections: Array<[string, string]> }> = {
  about: {
    eyebrow: "ABOUT FEEDME",
    title: "A shared care story, not another family chat.",
    intro: "Feedme gives the people caring for a child one calm, reliable timeline for the small moments that add up.",
    sections: [
      ["Made for real care teams", "Parents, partners and trusted caregivers can share one child space while keeping roles and access clear."],
      ["Built around the moments", "Track feeding, diaper changes, notes, reminders and the custom activities that matter to your family."],
      ["Designed to be useful", "Feedme helps people coordinate care. It does not replace medical advice or emergency services."],
    ],
  },
  privacy: {
    eyebrow: "TRUST CENTER",
    title: "Privacy, in plain language.",
    intro: "This page explains the principles that guide how Feedme handles family-care information. The final legal policy will be reviewed before public launch.",
    sections: [
      ["The short version", "Care information belongs to the families who add it. Feedme should use only what is needed to provide the shared-care service."],
      ["What the service uses", "Account details, child profiles, care events, notes, reminders and service-security information are used to operate the family space."],
      ["Your choices", "The product will provide a clear path to view policy information, export data, manage preferences and request account deletion."],
      ["Sensitive information", "Custom activities can contain sensitive details. Feedme will explain the applicable protections and retention rules in the final policy."],
    ],
  },
  cookies: {
    eyebrow: "TRUST CENTER",
    title: "Cookies and similar technology.",
    intro: "Feedme needs a small number of essential technologies to keep a signed-in session secure. Any optional analytics or advertising technology will be explained and controlled here before launch.",
    sections: [
      ["Essential", "Session and security cookies help keep an authenticated family space available and protected."],
      ["Optional", "Optional measurement or marketing tools must not run until the user has made a choice where consent is required."],
      ["Your preferences", "Signed-in users will find their cookie choices in Privacy & data. This public page will always explain what those choices mean."],
    ],
  },
  terms: {
    eyebrow: "TRUST CENTER",
    title: "Terms and safety.",
    intro: "Feedme is a coordination tool for family care. These terms are a readable product outline until the final terms receive legal review.",
    sections: [
      ["Using Feedme", "Account holders are responsible for the people they invite and the information they add to a shared child space."],
      ["Care, not clinical advice", "Feedme records information and reminders. It does not diagnose, prescribe, or replace a clinician or emergency service."],
      ["Shared access", "Family-space roles control who can view, write, manage care and change ownership-related settings."],
    ],
  },
  security: {
    eyebrow: "TRUST CENTER",
    title: "Security is part of care.",
    intro: "Feedme is being prepared with a practical, transparent approach to protecting family information. This page will be kept accurate as safeguards evolve.",
    sections: [
      ["Account protection", "Secure sign-in and role-based access help make sure the right people can reach a child’s care space."],
      ["Transport and infrastructure", "The production service uses encrypted HTTPS connections and managed operational safeguards."],
      ["Backups and deletion", "The public launch work includes encrypted backup, recovery and deletion procedures designed around family data."],
      ["Report a concern", "Use the contact page to report a security concern. A dedicated security contact will be published before launch."],
    ],
  },
  accessibility: {
    eyebrow: "TRUST CENTER",
    title: "Accessibility and inclusion.",
    intro: "Feedme is being designed so a family-care timeline is understandable and usable by as many people as possible. This statement will be reviewed and updated before public launch.",
    sections: [
      ["Designed for clarity", "The product uses readable language, clear labels, visible focus states and familiar controls for everyday care actions."],
      ["Keyboard and assistive technology", "Interactive controls are built to be operable by keyboard and to expose meaningful names and states to assistive technology."],
      ["Report a barrier", "A published support route will let a person report an accessibility barrier and request help using the service."],
    ],
  },
  contact: {
    eyebrow: "CONTACT FEEDME",
    title: "Questions, support, or a privacy request?",
    intro: "A public support and privacy contact channel will be published before launch. Until then, this page establishes where that help will live.",
    sections: [
      ["Product support", "Get help using shared timelines, activities, reminders, child spaces and caregiver roles."],
      ["Privacy requests", "Request access, export, correction or deletion through the future Privacy & data area or the published privacy contact."],
      ["Security reports", "Use the future security contact for responsibly reporting a suspected vulnerability or incident."],
    ],
  },
};

const hebrewPageByPath: typeof pageByPath = {
  about: {
    eyebrow: "אודות FEEDME",
    title: "סיפור טיפול משותף, לא עוד קבוצת משפחה.",
    intro: "Feedme נותנת לכל מי שמטפל בילד ציר זמן אחד, רגוע ואמין, לכל הרגעים הקטנים שמצטברים.",
    sections: [
      ["נבנה לצוותי טיפול אמיתיים", "הורים, בני ובנות זוג ומטפלים מהימנים יכולים לשתף מרחב ילד אחד, עם תפקידים והרשאות ברורים."],
      ["סביב הרגעים החשובים", "מתעדים האכלות, החלפות חיתול, הערות, תזכורות ופעילויות מותאמות אישית למשפחה."],
      ["שימושי באמת", "Feedme מסייעת בתיאום טיפול. היא אינה מחליפה ייעוץ רפואי או שירותי חירום."],
    ],
  },
  privacy: {
    eyebrow: "מרכז האמון",
    title: "פרטיות, בשפה פשוטה.",
    intro: "דף זה מסביר את העקרונות שמנחים את Feedme בטיפול במידע על טיפול משפחתי. המדיניות המשפטית הסופית תעבור בדיקה לפני ההשקה לציבור.",
    sections: [
      ["בקצרה", "מידע הטיפול שייך למשפחות שמוסיפות אותו. Feedme אמורה להשתמש רק במה שנדרש כדי לספק את שירות הטיפול המשותף."],
      ["באיזה מידע השירות משתמש", "פרטי חשבון, פרופילי ילדים, אירועי טיפול, הערות, תזכורות ומידע לצורכי אבטחת השירות משמשים להפעלת מרחב המשפחה."],
      ["הבחירות שלכם", "המוצר יספק דרך ברורה לקריאת המדיניות, ייצוא מידע, ניהול העדפות ובקשת מחיקת חשבון."],
      ["מידע רגיש", "פעילויות מותאמות אישית עשויות לכלול פרטים רגישים. Feedme תסביר את ההגנות וכללי השמירה הרלוונטיים במדיניות הסופית."],
    ],
  },
  cookies: {
    eyebrow: "מרכז האמון",
    title: "עוגיות וטכנולוגיות דומות.",
    intro: "Feedme זקוקה למספר קטן של טכנולוגיות חיוניות כדי לשמור על הפעלה מאובטחת של התחברות. כל אנליטיקה או פרסום אופציונליים יוסברו ויישלטו כאן לפני ההשקה.",
    sections: [
      ["חיוניות", "עוגיות הפעלה ואבטחה עוזרות לשמור על מרחב המשפחה המחובר זמין ומוגן."],
      ["אופציונליות", "כלי מדידה או שיווק אופציונליים לא יופעלו לפני שהמשתמש בחר בכך, במקומות שבהם נדרשת הסכמה."],
      ["ההעדפות שלכם", "משתמשים מחוברים ימצאו את בחירות העוגיות שלהם באזור פרטיות ומידע. הדף הציבורי יסביר תמיד מה משמעות הבחירות."],
    ],
  },
  terms: {
    eyebrow: "מרכז האמון",
    title: "תנאים ובטיחות.",
    intro: "Feedme היא כלי לתיאום טיפול משפחתי. תנאים אלה הם תיאור מוצר קריא עד שהנוסח הסופי יעבור בדיקה משפטית.",
    sections: [
      ["שימוש ב-Feedme", "בעלי חשבון אחראים לאנשים שהם מזמינים ולמידע שהם מוסיפים למרחב ילד משותף."],
      ["טיפול, לא ייעוץ רפואי", "Feedme מתעדת מידע ותזכורות. היא אינה מאבחנת, רושמת טיפול או מחליפה רופא או שירות חירום."],
      ["גישה משותפת", "תפקידים במרחב המשפחה קובעים מי יכול לצפות, לתעד, לנהל טיפול ולשנות הגדרות הקשורות לבעלות."],
    ],
  },
  security: {
    eyebrow: "מרכז האמון",
    title: "אבטחה היא חלק מהטיפול.",
    intro: "Feedme נבנית בגישה מעשית ושקופה להגנה על מידע משפחתי. הדף הזה יתעדכן ככל שההגנות יתפתחו.",
    sections: [
      ["הגנת חשבון", "התחברות מאובטחת וגישה מבוססת תפקידים עוזרות להבטיח שרק האנשים הנכונים יגיעו למרחב הטיפול של הילד."],
      ["תקשורת ותשתית", "שירות הייצור משתמש בחיבורי HTTPS מוצפנים ובהגנות תפעוליות מנוהלות."],
      ["גיבויים ומחיקה", "עבודת ההשקה לציבור כוללת תהליכי גיבוי מוצפן, שחזור ומחיקה המתוכננים סביב מידע משפחתי."],
      ["דיווח על בעיה", "אפשר להשתמש בדף יצירת קשר כדי לדווח על בעיית אבטחה. כתובת אבטחה ייעודית תפורסם לפני ההשקה."],
    ],
  },
  accessibility: {
    eyebrow: "מרכז האמון",
    title: "נגישות והכללה.",
    intro: "Feedme נבנית כך שציר הזמן המשפחתי יהיה מובן ושימושי לכמה שיותר אנשים. הצהרה זו תעבור בדיקה ותתעדכן לפני ההשקה לציבור.",
    sections: [
      ["נבנה לבהירות", "המוצר משתמש בשפה קריאה, תוויות ברורות, מצבי מיקוד גלויים ובקרות מוכרות לפעולות טיפול יומיומיות."],
      ["מקלדת וטכנולוגיה מסייעת", "בקרות אינטראקטיביות נבנות כדי לעבוד באמצעות מקלדת ולהציג שמות ומצבים משמעותיים לטכנולוגיה מסייעת."],
      ["דיווח על חסם", "ערוץ תמיכה שיפורסם יאפשר לאדם לדווח על חסם נגישות ולבקש סיוע בשימוש בשירות."],
    ],
  },
  contact: {
    eyebrow: "יצירת קשר עם FEEDME",
    title: "שאלות, תמיכה או בקשת פרטיות?",
    intro: "ערוץ ציבורי לתמיכה ולפרטיות יפורסם לפני ההשקה. בינתיים, דף זה מבהיר היכן העזרה הזאת תהיה זמינה.",
    sections: [
      ["תמיכה במוצר", "עזרה בשימוש בציר זמן משותף, פעילויות, תזכורות, מרחבי ילדים ותפקידי מטפלים."],
      ["בקשות פרטיות", "בקשת גישה, ייצוא, תיקון או מחיקה תתאפשר מאזור פרטיות ומידע העתידי או דרך איש הקשר לפרטיות שיפורסם."],
      ["דיווחי אבטחה", "איש קשר ייעודי לאבטחה יפורסם לצורך דיווח אחראי על חולשה או אירוע חשוד."],
    ],
  },
};

const trustLinks = (locale: PublicLocale) =>
  (locale === "he"
    ? [
        ["אודות", "/about"],
        ["פרטיות", "/privacy"],
        ["עוגיות", "/cookies"],
        ["תנאים ובטיחות", "/terms"],
        ["אבטחה", "/security"],
        ["נגישות", "/accessibility"],
        ["יצירת קשר", "/contact"],
      ]
    : [
        ["About", "/about"],
        ["Privacy", "/privacy"],
        ["Cookies", "/cookies"],
        ["Terms & safety", "/terms"],
        ["Security", "/security"],
        ["Accessibility", "/accessibility"],
        ["Contact", "/contact"],
      ]) as Array<[string, string]>;

const productScreens = [
  { id: "timeline", en: "Feedme's shared care timeline", he: "ציר הזמן המשותף של Feedme" },
  { id: "timeline-history", en: "Feedme care history log", he: "היסטוריית הטיפול של Feedme" },
  { id: "insights", en: "Feedme care insights", he: "תובנות הטיפול של Feedme" },
  { id: "caregivers", en: "Feedme caregiver management", he: "ניהול המטפלים של Feedme" },
] as const;

function ProductCarousel({ locale }: { locale: PublicLocale }) {
  const he = locale === "he";
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const screenshotLocale = he ? "he" : "en";

  const updateActiveSlide = () => {
    const track = trackRef.current;
    if (!track) return;
    const scrollOffset = he ? Math.abs(track.scrollLeft) : track.scrollLeft;
    setActiveIndex(Math.round(scrollOffset / track.clientWidth));
  };

  const selectSlide = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: (he ? -1 : 1) * track.clientWidth * index, behavior: "smooth" });
  };

  return (
    <section className="marketing-product-carousel" aria-label={he ? "צילומי מסך של Feedme" : "Feedme product screenshots"}>
      <div className="marketing-carousel-frame">
        <div className="marketing-carousel-track" dir={he ? "rtl" : "ltr"} ref={trackRef} onScroll={updateActiveSlide}>
          {productScreens.map((screen, index) => <div className={`marketing-carousel-slide${index === activeIndex ? " active" : ""}`} key={screen.id}>
            {Math.abs(index - activeIndex) <= 1 && <picture>
              <source media="(min-width: 761px)" srcSet={`/product-screenshots/${screen.id}-${screenshotLocale}-desktop.png`} />
              <img loading={index === activeIndex ? "eager" : "lazy"} src={`/product-screenshots/${screen.id}-${screenshotLocale}-mobile.png`} alt={he ? screen.he : screen.en} />
            </picture>}
          </div>)}
        </div>
      </div>
      <div className="marketing-carousel-dots" role="tablist" aria-label={he ? "בחירת צילום מסך" : "Choose a product screenshot"}>
        {productScreens.map((screen, index) => <button
          key={screen.id}
          type="button"
          role="tab"
          aria-label={he ? screen.he : screen.en}
          aria-selected={index === activeIndex}
          className={index === activeIndex ? "active" : ""}
          onClick={() => selectSlide(index)}
        />)}
      </div>
    </section>
  );
}

function Header({ locale, onOpenLanguage, onNavigate, onSignIn }: Pick<PublicSiteProps, "locale" | "onNavigate" | "onSignIn"> & { onOpenLanguage: () => void }) {
  const he = locale === "he";
  return <header className="marketing-header">
    <FeedmeBrand onClick={() => onNavigate("/")} />
    <nav aria-label="Public navigation">
      <button onClick={() => onNavigate("/#how-it-works")}>{he ? "איך זה עובד" : "How it works"}</button>
      <button onClick={() => onNavigate("/privacy")}>{he ? "אמון ופרטיות" : "Trust"}</button>
    </nav>
    <div className="marketing-header-actions">
      <LanguageControl locale={locale} label={he ? "שפה" : "Language"} onClick={onOpenLanguage} />
      <button className="marketing-sign-in" onClick={onSignIn}>{he ? "כניסה" : "Sign in"}</button>
    </div>
  </header>;
}

function Footer({ locale, onNavigate }: Pick<PublicSiteProps, "locale" | "onNavigate">) {
  return <footer className="marketing-footer">
    <div><FeedmeBrand onClick={() => onNavigate("/")} /><p>{locale === "he" ? "טיפול משותף, במקום אחד." : "Shared care, held together."}</p></div>
    <div className="marketing-footer-links">
      {trustLinks(locale).map(([label, path]) => <button key={path} onClick={() => onNavigate(path)}>{label}</button>)}
    </div>
  </footer>;
}

function Landing({ locale, onNavigate, onSignIn }: Pick<PublicSiteProps, "locale" | "onNavigate" | "onSignIn">) {
  const he = locale === "he";
  return <>
    <section className="marketing-hero">
      <div className="marketing-hero-copy">
        <h1>{he ? "כל רגע קטן של טיפול, מחובר יחד." : "Every small care moment, held together."}</h1>
        <p>{he ? "ציר זמן משותף אחד להאכלות, החלפות חיתול, הערות, תזכורות ולכל מי שמטפל בילד שלכם." : "One shared timeline for feeds, diaper changes, notes, reminders and the people who care for your child."}</p>
        <div className="marketing-actions">
          <button className="marketing-cta" onClick={onSignIn}>{he ? "התחלת מרחב משפחתי" : "Start your family space"} {he ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}</button>
          <button className="marketing-secondary" onClick={() => onNavigate("/#how-it-works")}>{he ? "לגלות איך זה עובד" : "See how it works"}</button>
        </div>
      </div>
      <ProductCarousel locale={locale} />
    </section>
    <section id="how-it-works" className="marketing-section marketing-value-section">
      <div className="marketing-section-heading">
        <h2>{he ? "הטיפול מרגיש קל יותר כשכולם רואים את אותו הסיפור." : "Care feels lighter when everyone sees the same story."}</h2>
      </div>
      <p className="marketing-lede">{he ? "Feedme הופכת את העברת המידע היומיומית לציר זמן אחד שאפשר לסמוך עליו — בלי להפוך טיפול משפחתי לניהול אדמיניסטרטיבי." : "Feedme turns the everyday handoff into one trustworthy timeline—without making family care feel like admin."}</p>
      <div className="marketing-value-list">
        <article><span>01</span><Clock3 /><h3>{he ? "תיעוד בתוך שניות" : "Log in seconds"}</h3><p>{he ? "האכלות, חיתולים, הערות ופעילויות מותאמות אישית שהמשפחה באמת משתמשת בהן." : "Feeds, diapers, notes, and the custom activities your family actually uses."}</p></article>
        <article><span>02</span><Users /><h3>{he ? "נשארים מתואמים" : "Stay in sync"}</h3><p>{he ? "הורים ומטפלים רואים מה קרה, מתי זה קרה ומה צפוי בהמשך." : "Parents and caregivers see what happened, when it happened, and what comes next."}</p></article>
        <article><span>03</span><HeartPulse /><h3>{he ? "מזהים דפוסים" : "Notice the pattern"}</h3><p>{he ? "סיכומים עדינים עוזרים לראות דפוסי טיפול, בלי להתיימר לתת ייעוץ רפואי." : "Gentle summaries make care patterns easier to see without pretending to give medical advice."}</p></article>
      </div>
    </section>
  </>;
}

function LegalPage({ page, locale }: Pick<PublicSiteProps, "page" | "locale">) {
  const content = (locale === "he" ? hebrewPageByPath : pageByPath)[page as Exclude<PublicPage, "landing">];
  return <>
    <section className="legal-hero"><p className="marketing-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.intro}</p></section>
    <main className="legal-content">
      <aside><strong>{locale === "he" ? "בדף הזה" : "ON THIS PAGE"}</strong>{content.sections.map(([heading]) => <a key={heading} href={`#${heading.toLowerCase().replaceAll(" ", "-")}`}>{heading}</a>)}</aside>
      <article>{content.sections.map(([heading, body]) => <section id={heading.toLowerCase().replaceAll(" ", "-")} key={heading}><h2>{heading}</h2><p>{body}</p></section>)}<div className="legal-callout"><ShieldCheck size={20} /><p>{locale === "he" ? "לפני ההשקה, מדיניות סופית, פרטי קשר ותאריכי תחילה יחליפו את טיוטות הדפים הציבוריים המוכנות האלה." : "Before launch, final policies, contact details and effective dates will replace these prepared public-page drafts."}</p></div></article>
    </main>
  </>;
}

export function PublicSite({ page, locale, onLocale, onNavigate, onSignIn }: PublicSiteProps) {
  const [languageOpen, setLanguageOpen] = useState(false);
  return <div className="marketing-shell" dir={locale === "he" ? "rtl" : "ltr"}>
    <Header locale={locale} onOpenLanguage={() => setLanguageOpen(true)} onNavigate={onNavigate} onSignIn={onSignIn} />
    {page === "landing" ? <Landing locale={locale} onNavigate={onNavigate} onSignIn={onSignIn} /> : <LegalPage page={page} locale={locale} />}
    <Footer locale={locale} onNavigate={onNavigate} />
    {languageOpen && <LanguagePicker locale={locale} onClose={() => setLanguageOpen(false)} onSelect={(nextLocale) => { onLocale(nextLocale); setLanguageOpen(false); }} />}
  </div>;
}

export function HelpLegalPanel({ locale, onNavigate, onClose }: { locale: PublicLocale; onNavigate: (path: string) => void; onClose: () => void }) {
  const he = locale === "he";
  return <div className="help-legal-panel" dir={he ? "rtl" : "ltr"}>
    <div><div><p className="marketing-eyebrow">{he ? "עזרה ומשפטי" : "HELP & LEGAL"}</p><h2>{he ? "עזרה למרחב המשפחתי שלכם." : "Help for your family space."}</h2></div><button className="icon-button" onClick={onClose} aria-label={he ? "סגירת עזרה ומשפטי" : "Close help and legal"}>×</button></div>
    <p>{he ? "מידע על המוצר ודפים משפטיים זמינים מכל מקום ב-Feedme." : "Reach the product information and legal pages from anywhere in Feedme."}</p>
    <div className="help-legal-links"><button onClick={() => onNavigate("/contact")}><Users size={18} /> {he ? "יצירת קשר ותמיכה" : "Contact & support"}<ChevronRight size={17} /></button>{trustLinks(locale).map(([label, path]) => <button key={path} onClick={() => onNavigate(path)}>{path === "/privacy" ? <LockKeyhole size={18} /> : path === "/cookies" ? <Cookie size={18} /> : path === "/terms" ? <FileText size={18} /> : path === "/accessibility" ? <Eye size={18} /> : <ShieldCheck size={18} />} {label}<ChevronRight size={17} /></button>)}</div>
  </div>;
}
