import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Clock3, Eye, FileText, HeartPulse, LockKeyhole, LogOut, Mail, Settings, ShieldCheck, Users } from "lucide-react";
import { useRef, useState } from "react";
import { FeedmeBrand } from "./components/FeedmeBrand";
import { LanguageControl } from "./components/LanguageControl";
import { LanguagePicker } from "./components/LanguagePicker";

export type PublicPage = "landing" | "about" | "privacy" | "terms" | "accessibility" | "contact";
type PublicLocale = "en" | "he";

type PublicSiteProps = {
  page: PublicPage;
  locale: PublicLocale;
  onLocale: (locale: PublicLocale) => void;
  onNavigate: (path: string) => void;
  onSignIn: () => void;
  accountName?: string;
  onSettings?: () => void;
  onSignOut?: () => void;
};

const pageByPath: Record<Exclude<PublicPage, "landing">, { eyebrow?: string; title: string; intro: string; sections: Array<[string, string]> }> = {
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
    title: "Privacy",
    intro: "We take practical steps to protect your family’s information and explain clearly how we use it.",
    sections: [
      ["What we keep", "We keep the details your family provides: email and display name for accounts; a child’s name, time zone, and optional birth date; plus care records, notes, reminders, and custom fields. We do not ask for government, health, or other official ID numbers. Internal IDs only connect records inside Feedme. Custom fields may contain sensitive information, so only add what your family needs."],
      ["Who can see it", "The people you add to a child space can see the information shared in that space. Their role determines whether they can only view it, add records, or manage care settings."],
      ["Why we use it", "We use this information to sign you in, show the shared timeline, run reminders and insights, and keep the service secure. We do not sell care information, show ads, or use tracking analytics."],
      ["Your controls", "In Privacy & data, you can download a copy of your account data or permanently delete your account. Deleting an account removes its profile, notes, comments, and invitations. Shared care records remain without your identity; a child space you own alone is deleted."],
      ["Storage and backups", "Data is stored in a private database on our server. We keep daily recovery copies for 14 days. Deleted information may remain in a recovery copy until that copy expires. These backups are protected by server access controls, but are not yet encrypted separately."],
      ["Cookies and security", "Feedme uses one essential, signed-in session cookie. It is not used for advertising or tracking. Connections use HTTPS, passwords are stored as hashes, and the database is not directly public on the internet."],
    ],
  },
  terms: {
    title: "Terms of use",
    intro: "A few simple rules for using Feedme and sharing a child’s care information.",
    sections: [
      ["Using Feedme", "Only add or share child information you are allowed to manage, and keep your account secure."],
      ["Sharing a care space", "You choose who joins a child space. Anyone you invite may see the information shared there, according to their role. Invite only people you trust with that information."],
      ["Use it responsibly", "Do not use Feedme to harm others, interfere with the service, or add information about someone without permission. We may limit access when needed to protect the service or its users."],
      ["Care, not medical advice", "Feedme helps you record care and remember routines. It does not diagnose, prescribe, or replace a clinician, emergency service, or your own judgment."],
      ["Your content and data", "You keep responsibility for the care information you add. Feedme does not ask for government, health, or other official ID numbers; account and child details come from what your family provides. You allow Feedme to store and show care information to the people in the relevant care space so the service can work. The Privacy page explains how to export or delete account data."],
      ["Changes and availability", "We may update, pause, or remove features as Feedme changes. If we make an important change to these terms, we will update this page."],
      ["Law and disputes", "These terms are governed by Israeli law. If a problem comes up, contact Feedme first. If we cannot resolve it together, it will be handled by the competent courts in Israel."],
      ["Questions", "If something is unclear, contact Feedme through the Contact page before using the service."],
    ],
  },
  accessibility: {
    title: "Accessibility and inclusion.",
    intro: "We built Feedme to be clear and easy to use. To support this, we implemented a number of accessibility principles.",
    sections: [
      ["Designed for clarity", "The product uses readable language, clear labels, visible focus states and familiar controls for everyday care actions."],
      ["Keyboard and assistive technology", "Interactive controls are built to be operable by keyboard and to expose meaningful names and states to assistive technology."],
      ["Report a barrier", "A published support route will let a person report an accessibility barrier and request help using the service."],
    ],
  },
  contact: {
    eyebrow: "CONTACT FEEDME",
    title: "Questions, support, or a privacy request?",
    intro: "You can contact us about anything.",
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
    title: "פרטיות",
    intro: "אנחנו נוקטים צעדים מעשיים כדי להגן על המידע המשפחתי שלכם ומסבירים בצורה ברורה איך אנחנו משתמשים בו.",
    sections: [
      ["מה אנחנו שומרים", "אנחנו שומרים את הפרטים שהמשפחה מוסיפה: אימייל ושם תצוגה לחשבון; שם הילד, אזור הזמן ותאריך לידה אופציונלי; וגם רשומות טיפול, הערות, תזכורות ושדות מותאמים אישית. אנחנו לא מבקשים מספר תעודת זהות, מספר קופת חולים או מזהה רשמי אחר. מזהים פנימיים משמשים רק לקישור הרשומות בתוך Feedme. שדות מותאמים עשויים להכיל מידע רגיש, לכן כדאי להוסיף רק מה שהמשפחה צריכה."],
      ["מי יכול לראות", "האנשים שאתם מוסיפים למרחב ילד יכולים לראות את המידע שמשותף בו. התפקיד שלהם קובע אם הם יכולים רק לצפות, להוסיף רשומות או לנהל הגדרות טיפול."],
      ["למה אנחנו משתמשים במידע", "המידע משמש להתחברות, להצגת ציר הזמן המשותף, להפעלת תזכורות ותובנות ולשמירה על אבטחת השירות. אנחנו לא מוכרים מידע על טיפול, לא מציגים פרסומות ולא משתמשים בכלי מעקב אנליטיים."],
      ["השליטה שלכם", "באזור פרטיות ונתונים אפשר להוריד עותק של נתוני החשבון או למחוק את החשבון לצמיתות. מחיקת חשבון מסירה את הפרופיל, ההערות, התגובות וההזמנות שלו. רשומות טיפול משותפות נשארות בלי הזהות שלכם; מרחב ילד שבבעלותכם בלבד נמחק."],
      ["אחסון וגיבויים", "המידע נשמר במסד נתונים פרטי בשרת שלנו. אנחנו שומרים עותקי שחזור יומיים ל-14 ימים. מידע שנמחק עשוי להישאר בעותק שחזור עד שתוקפו יפוג. הגיבויים מוגנים באמצעות בקרות גישה לשרת, אך עדיין אינם מוצפנים בנפרד."],
      ["עוגיות ואבטחה", "Feedme משתמשת בעוגיית התחברות חיונית אחת. היא לא משמשת לפרסום או למעקב. החיבור מוצפן ב-HTTPS, סיסמאות נשמרות בצורה מוצפנת ומסד הנתונים אינו פתוח ישירות לאינטרנט."],
    ],
  },
  terms: {
    title: "תנאי שימוש",
    intro: "כמה כללים פשוטים לשימוש ב-Feedme ולשיתוף מידע על הטיפול בילד.",
    sections: [
      ["שימוש ב-Feedme", "הוסיפו או שתפו מידע על ילד רק אם אתם מורשים לנהל אותו, ושמרו על אבטחת החשבון שלכם."],
      ["שיתוף מרחב טיפול", "אתם בוחרים מי מצטרף למרחב ילד. כל מי שאתם מזמינים יכול לראות את המידע שמשותף בו, בהתאם לתפקיד שלו. הזמינו רק אנשים שאתם סומכים עליהם עם המידע הזה."],
      ["שימוש אחראי", "אין להשתמש ב-Feedme כדי לפגוע באחרים, להפריע לשירות או להוסיף מידע על אדם ללא רשות. אנחנו עשויים להגביל גישה כשצריך כדי להגן על השירות או על המשתמשים בו."],
      ["טיפול, לא ייעוץ רפואי", "Feedme עוזרת לתעד טיפול ולזכור שגרה. היא אינה מאבחנת, רושמת טיפול או מחליפה רופא, שירות חירום או שיקול דעת אישי."],
      ["התוכן והמידע שלכם", "אתם נשארים אחראים למידע הטיפולי שאתם מוסיפים. Feedme לא מבקשת מספר תעודת זהות, מספר קופת חולים או מזהה רשמי אחר; פרטי החשבון והילד מגיעים ממה שהמשפחה מוסיפה. אתם מאפשרים ל-Feedme לשמור ולהציג מידע טיפולי לאנשים במרחב הטיפול הרלוונטי כדי שהשירות יעבוד. בדף הפרטיות מוסבר איך לייצא או למחוק נתוני חשבון."],
      ["שינויים וזמינות", "אנחנו עשויים לעדכן, להשהות או להסיר יכולות כשהשירות משתנה. אם נעשה שינוי חשוב בתנאים, נעדכן את העמוד הזה."],
      ["דין ומחלוקות", "תנאים אלה כפופים לדיני מדינת ישראל. אם עולה בעיה, פנו קודם ל-Feedme. אם לא נצליח לפתור אותה יחד, היא תתברר בבתי המשפט המוסמכים בישראל."],
      ["שאלות", "אם משהו אינו ברור, אפשר לפנות ל-Feedme דרך דף יצירת הקשר לפני השימוש בשירות."],
    ],
  },
  accessibility: {
    title: "נגישות והכללה.",
    intro: "בנינו את Feedme כך שתהיה ברורה וקלה לשימוש, לשם כך דאגנו ליישם מספר עקרונות הנגשה.",
    sections: [
      ["נבנה לבהירות", "המוצר משתמש בשפה קריאה, תוויות ברורות, מצבי מיקוד גלויים ובקרות מוכרות לפעולות טיפול יומיומיות."],
      ["מקלדת וטכנולוגיה מסייעת", "בקרות אינטראקטיביות נבנות כדי לעבוד באמצעות מקלדת ולהציג שמות ומצבים משמעותיים לטכנולוגיה מסייעת."],
      ["דיווח על חסם", "ערוץ תמיכה שיפורסם יאפשר לאדם לדווח על חסם נגישות ולבקש סיוע בשימוש בשירות."],
    ],
  },
  contact: {
    eyebrow: "יצירת קשר עם FEEDME",
    title: "שאלות, תמיכה או בקשת פרטיות?",
    intro: "אתם יכולים לפנות אלינו לכל נושא.",
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
        ["תנאים ובטיחות", "/terms"],
        ["נגישות", "/accessibility"],
        ["יצירת קשר", "/contact"],
      ]
    : [
        ["About", "/about"],
        ["Privacy", "/privacy"],
        ["Terms & safety", "/terms"],
        ["Accessibility", "/accessibility"],
        ["Contact", "/contact"],
      ]) as Array<[string, string]>;

const productScreens = [
  { id: "timeline", en: "Feedme's shared care timeline, showing today's care events and sidebar navigation.", he: "ציר הזמן המשותף של Feedme, עם אירועי הטיפול של היום ותפריט הניווט." },
  { id: "timeline-history", en: "Feedme's care history, showing recorded care events in chronological order.", he: "היסטוריית הטיפול של Feedme, עם רשומות טיפול בסדר כרונולוגי." },
  { id: "log-feeding", en: "The Feedme form for recording a feeding, including time, amount, and feeding method.", he: "טופס תיעוד האכלה ב-Feedme, הכולל זמן, כמות ואופן האכלה." },
  { id: "insights", en: "Feedme care insights, showing patterns and summaries from recorded care.", he: "תובנות הטיפול של Feedme, המציגות דפוסים וסיכומים מתוך הטיפול שתועד." },
  { id: "caregivers", en: "Feedme caregiver management, showing the people who have access to a child's care space.", he: "ניהול המטפלים ב-Feedme, המציג את האנשים שיש להם גישה למרחב הטיפול של הילד." },
] as const;

function ProductCarousel({ locale }: { locale: PublicLocale }) {
  const he = locale === "he";
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
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
    const boundedIndex = Math.max(0, Math.min(index, productScreens.length - 1));
    track.scrollTo({
      left: (he ? -1 : 1) * track.clientWidth * boundedIndex,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  const selectAdjacentSlide = (side: "left" | "right") => {
    const direction = side === "left" ? (he ? 1 : -1) : (he ? -1 : 1);
    selectSlide(activeIndex + direction);
  };

  return (
    <section className="marketing-product-carousel" aria-label={he ? "צילומי מסך של Feedme" : "Feedme product screenshots"}>
      <div className="marketing-carousel-frame">
        <div
          className="marketing-carousel-track"
          dir={he ? "rtl" : "ltr"}
          ref={trackRef}
          onScroll={updateActiveSlide}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            touchStartX.current = null;
            const endX = event.changedTouches[0]?.clientX;
            if (startX === null || endX === undefined || Math.abs(endX - startX) < 36) return;
            const isNextSlide = he ? endX > startX : endX < startX;
            selectSlide(activeIndex + (isNextSlide ? 1 : -1));
          }}
        >
          {productScreens.map((screen, index) => <div className={`marketing-carousel-slide${index === activeIndex ? " active" : ""}`} data-screen={screen.id} key={screen.id} aria-hidden={index !== activeIndex}>
            {Math.abs(index - activeIndex) <= 1 && <picture>
              <source media="(min-width: 761px)" srcSet={`/product-screenshots/${screen.id}-${screenshotLocale}-desktop.png`} />
              <img loading={index === activeIndex ? "eager" : "lazy"} src={`/product-screenshots/${screen.id}-${screenshotLocale}-mobile.png`} alt={he ? screen.he : screen.en} />
            </picture>}
          </div>)}
        </div>
        <button className="marketing-carousel-arrow marketing-carousel-arrow-left" type="button" aria-label={he ? "הצילום הקודם" : "Previous screenshot"} onClick={() => selectAdjacentSlide(he ? "right" : "left")}>{he ? <ChevronRight size={23} /> : <ChevronLeft size={23} />}</button>
        <button className="marketing-carousel-arrow marketing-carousel-arrow-right" type="button" aria-label={he ? "הצילום הבא" : "Next screenshot"} onClick={() => selectAdjacentSlide(he ? "left" : "right")}>{he ? <ChevronLeft size={23} /> : <ChevronRight size={23} />}</button>
      </div>
      <div className="marketing-carousel-dots" role="group" aria-label={he ? "בחירת צילום מסך" : "Choose a product screenshot"}>
        {productScreens.map((screen, index) => <button
          key={screen.id}
          type="button"
          aria-label={he ? `צילום מסך ${index + 1} מתוך ${productScreens.length}${index === activeIndex ? ", נוכחי" : ""}` : `Screenshot ${index + 1} of ${productScreens.length}${index === activeIndex ? ", current" : ""}`}
          className={index === activeIndex ? "active" : ""}
          onClick={() => selectSlide(index)}
        />)}
      </div>
    </section>
  );
}

function Header({ locale, onOpenLanguage, onNavigate, onSignIn, accountName, onSettings, onSignOut }: Pick<PublicSiteProps, "locale" | "onNavigate" | "onSignIn" | "accountName" | "onSettings" | "onSignOut"> & { onOpenLanguage: () => void }) {
  const he = locale === "he";
  const [accountOpen, setAccountOpen] = useState(false);
  return <header className="marketing-header">
    <FeedmeBrand locale={locale} onClick={() => onNavigate("/")} />

    <div className="marketing-header-actions">
      <LanguageControl locale={locale} label={he ? "שפה" : "Language"} onClick={onOpenLanguage} />
      {accountName && onSettings && onSignOut ? <div className="marketing-account">
        <button className="marketing-account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-haspopup="true" aria-labelledby="marketing-account-label marketing-account-name">
          <span id="marketing-account-label" className="sr-only">{he ? "תפריט חשבון" : "Account menu"}</span>
          <span className="marketing-account-avatar" aria-hidden="true">{accountName[0]}</span>
          <span id="marketing-account-name" className="marketing-account-name">{accountName}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {accountOpen && <div className="marketing-account-menu">
          <button onClick={() => { setAccountOpen(false); onSettings(); }}><Settings size={16} /> {he ? "הגדרות" : "Settings"}</button>
          <button className="marketing-account-sign-out" onClick={() => { setAccountOpen(false); onSignOut(); }}><LogOut size={16} /> {he ? "התנתקות" : "Sign out"}</button>
        </div>}
      </div> : <button className="marketing-sign-in" onClick={onSignIn}>{he ? "כניסה" : "Sign in"}</button>}
    </div>
  </header>;
}

function Footer({ locale, onNavigate }: Pick<PublicSiteProps, "locale" | "onNavigate">) {
  return <footer className="marketing-footer">
    <div><FeedmeBrand locale={locale} onClick={() => onNavigate("/")} /><p>{locale === "he" ? "טיפול משותף, במקום אחד." : "Shared care, held together."}</p></div>
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
          <button className="marketing-cta marketing-enter-space" onClick={onSignIn}>{he ? "כנס למרחב המשפחתי" : "Enter your care space"} {he ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}</button>
          <button className="marketing-secondary" onClick={() => onNavigate("/#how-it-works")}>{he ? "איך זה עובד" : "How it works"}</button>
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
  const isPrivacy = page === "privacy";
  if (page === "about") return <AboutPage locale={locale} />;
  if (page === "contact") return <ContactPage content={content} locale={locale} />;
  if (page === "accessibility") return <AccessibilityPage locale={locale} />;
  return <>
    <section className="legal-hero">{content.eyebrow && <p className="marketing-eyebrow">{content.eyebrow}</p>}<h1>{content.title}</h1><p>{content.intro}</p></section>
    <div className="legal-content">
      <aside><strong>{locale === "he" ? "בדף הזה" : "ON THIS PAGE"}</strong>{content.sections.map(([heading]) => <a key={heading} href={`#${heading.toLowerCase().replaceAll(" ", "-")}`}>{heading}</a>)}</aside>
      <article>{content.sections.map(([heading, body]) => <section id={heading.toLowerCase().replaceAll(" ", "-")} key={heading}><h2>{heading}</h2><p>{body}</p></section>)}{isPrivacy && <div className="legal-callout"><ShieldCheck size={20} /><p>{locale === "he" ? <>שאלות על פרטיות או על הנתונים שלכם? אפשר לפנות אלינו ב־<a href="mailto:maorts14@gmail.com">maorts14@gmail.com</a>.</> : <>Questions about privacy or your data? Contact us at <a href="mailto:maorts14@gmail.com">maorts14@gmail.com</a>.</>}</p></div>}</article>
    </div>
  </>;
}

function AccessibilityPage({ locale }: { locale: PublicLocale }) {
  const content = (locale === "he" ? hebrewPageByPath : pageByPath).accessibility;
  const he = locale === "he";
  const principles = locale === "he"
    ? [
        ["ניגודיות צבעים קריאה", "חיזקנו את הניגודיות בין טקסט, לחצנים, סמלי פעולה ומצבי מיקוד, כדי לשפר את הקריאות."],
        ["טקסט קריא", "הגדלנו טקסט תפעולי קטן וחיזקנו צבעי טקסט משניים, כדי שהמידע היומיומי יהיה נוח יותר לקריאה."],
        ["תמיכה בעברית ובאנגלית", "הממשק מתאים את השפה ואת הכיוון שלו לבחירת המשתמש, כולל תצוגה מימין לשמאל בעברית."],
        ["מקלדת ומצב מיקוד", "אפשר להגיע לפעולות באמצעות המקלדת ולראות סימון מיקוד ברור."],
        ["חלונות קופצים", "חלונות קופצים שומרים את המיקוד בתוכם, נסגרים ב־Esc ומחזירים את המיקוד לפעולה שפתחה אותם."],
        ["טפסים ומשוב", "שדות הטופס מקבלים תוויות ברורות, השלמה אוטומטית היכן שמתאים, ושגיאות מוצגות גם כהודעה לקוראי מסך."],
        ["מבנה ומשמעות", "אנו משתמשים בכותרות, אזורי תוכן ראשיים וכפתורים אמיתיים כדי שטכנולוגיה מסייעת תוכל להבין את הממשק."],
        ["כפתורים", "הכפתורים באפליקציה מותאמים בגודלם כדי לדאוג לנוחות השימוש בהם."],
        ["הפחתת תנועה", "המעברים והאנימציות מכבדים את העדפת המערכת להפחתת תנועה."],
      ]
    : [
        ["Readable color contrast", "We strengthened contrast for text, buttons, action icons, and focus indicators to improve readability."],
        ["Readable text", "We increased small operational text and strengthened secondary text colors so everyday information is easier to read."],
        ["English and Hebrew support", "The interface follows the user’s selected language and direction, including right-to-left presentation in Hebrew."],
        ["Keyboard and visible focus", "Actions can be reached by keyboard and show a clear focus indicator."],
        ["Dialogs", "Dialogs keep keyboard focus inside, close with Esc, and return focus to the control that opened them."],
        ["Forms and feedback", "Form fields have clear labels, appropriate autocomplete support, and errors are announced to screen readers."],
        ["Structure and meaning", "We use headings and real buttons so assistive technology can understand the interface."],
        ["Buttons", "Buttons are sized to make them comfortable to use."],
        ["Reduced motion", "Transitions and animations respect the system preference for reduced motion."],
      ];
  return <>
    <section className="legal-hero"><h1>{content.title}</h1><p>{content.intro}</p></section>
    <div className="accessibility-content">
      <ol>{principles.map(([heading, body]) => <li key={heading}><h2>{heading}</h2><p>{body}</p></li>)}</ol>
      <section className="accessibility-statement" aria-labelledby="accessibility-statement-heading">
        <p className="eyebrow">{he ? "הצהרת נגישות" : "ACCESSIBILITY STATEMENT"}</p>
        <h2 id="accessibility-statement-heading">{he ? "המחויבות שלנו" : "Our commitment"}</h2>
        <p>{he ? "Feedme פועלת כדי לאפשר שימוש ברור ונוח בשירות לכל אדם. אנו שואפים לעמוד בהנחיות WCAG 2.2 ברמה AA, ככל שהן חלות על השירות. זו אינה הצהרת הסמכה." : "Feedme works to make the service clear and usable for everyone. We aim to meet WCAG 2.2 AA where it applies to the service. This is not a certification statement."}</p>
        <dl>
          <div><dt>{he ? "עדכון אחרון" : "Last updated"}</dt><dd>{he ? "19 בספטמבר 2026" : "19 September 2026"}</dd></div>
          <div><dt>{he ? "אחראי נגישות" : "Accessibility contact"}</dt><dd>{he ? "צוות התמיכה של Feedme" : "Feedme support team"}</dd></div>
        </dl>
        <h2>{he ? "דיווח על חסם נגישות" : "Report an accessibility barrier"}</h2>
        <p>{he ? "אם נתקלתם בקושי בשימוש בשירות או זקוקים לחלופה נגישה, אפשר לפנות אלינו באימייל או ב־WhatsApp. כדאי לציין את העמוד או הפעולה, הדפדפן וטכנולוגיית העזר שבה השתמשתם." : "If you encounter a barrier or need an accessible alternative, contact us by email or WhatsApp. Please include the page or action, browser, and assistive technology you used."}</p>
        <p className="accessibility-contact-links"><a href="mailto:maorts14@gmail.com">maorts14@gmail.com</a><span aria-hidden="true"> · </span><a href={`https://wa.me/972503329996?text=${encodeURIComponent(he ? "היי, אני רוצה לדווח על חסם נגישות ב-Feedme" : "Hi, I want to report an accessibility barrier in Feedme")}`} target="_blank" rel="noreferrer">WhatsApp</a></p>
        <h2>{he ? "הליך טיפול ומגבלות ידועות" : "Response process and known limitations"}</h2>
        <p>{he ? "נבדוק כל פנייה ונשיב דרך ערוץ הפנייה. בדיקות ידניות של קוראי מסך, דפדפנים ותרחישים שונים נמשכות; אם משהו אינו נגיש לכם, ננסה לספק דרך חלופית ולהשתמש בדיווח כדי לשפר את השירות." : "We review each report and reply through the contact channel. Manual testing across screen readers, browsers, and scenarios is ongoing; if something is inaccessible to you, we will try to provide an alternative and use the report to improve the service."}</p>
      </section>
    </div>
  </>;
}

function AboutPage({ locale }: { locale: PublicLocale }) {
  const he = locale === "he";
  const heroTitle = he
    ? "אתם משקיעים המון בטיפול בילדים, תנו לנו לזכור מה קרה ומתי"
    : "You invest so much in caring for your children. Let us remember what happened and when.";
  const heroCopy = he
    ? [
        "Feedme נותנת לכם מקום לתעד את פעילויות הטיפול בילדים בקלות ובנוחות.",
        "עם התזכורות והמידע של Feedme תדעו תמיד מתי הילד צריך לאכול או האם הוא הרטיב מספיק טיטולים היום.",
      ]
    : [
        "Feedme gives you an easy, comfortable place to record your child’s care activities.",
        "With Feedme’s reminders and information, you’ll always know when your child needs to eat and whether they have had enough wet diapers today.",
      ];
  const story = he
    ? [
        "Feedme הוקמה מתוך צורך אמיתי שלנו כהורים.",
        "הרצון להיות בשליטה על מה שקורה עם התינוק שלנו ולשתף את המידע בקלות בין המטפלים הוביל אותנו לפתח את האפליקציה.",
        "השקענו המון מחשבה על חוויית המשתמש — כדי שתהיו מעודכנים תמיד.",
        "אז במקום לנהל טבלאות או לנסות לזכור בראש מתי האכלתם אותו לאחרונה, תוסיפו רשומה ב-Feedme ותהיו עם ראש שקט.",
      ]
    : [
        "Feedme was born from a real need we felt as parents.",
        "Wanting to stay in control of what was happening with our baby—and to easily share information between caregivers—led us to build the app.",
        "We put a great deal of thought into the user experience, so you can always stay up to date.",
        "Instead of managing spreadsheets or trying to remember when you last fed them, add a record in Feedme and enjoy peace of mind.",
      ];
  return <>
    <section className="legal-hero about-hero"><p className="marketing-eyebrow">{he ? "אודות FEEDME" : "ABOUT FEEDME"}</p><h1>{heroTitle}</h1><p>{heroCopy[0]}<br /><br />{heroCopy[1]}</p></section>
    <div className="about-content"><p>{story[0]}<br /><br />{story[1]}<br /><br />{story[2]}<br /><br />{story[3]}</p></div>
  </>;
}

function ContactPage({ content, locale }: { content: (typeof pageByPath)["contact"]; locale: PublicLocale }) {
  const he = locale === "he";
  const whatsappMessage = he ? "היי, יש לי שאלה לגבי Feedme" : "Hi, I have a question about Feedme";
  return <>
    <section className="legal-hero"><p className="marketing-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.intro}</p></section>
    <div className="contact-content">
      <a className="contact-action" href="mailto:maorts14@gmail.com">
        <Mail aria-hidden="true" />
        <span><small>{he ? "אימייל" : "Email"}</small><strong dir="ltr">maorts14@gmail.com</strong></span>
      </a>
      <a className="contact-action contact-whatsapp" href={`https://wa.me/972503329996?text=${encodeURIComponent(whatsappMessage)}`} target="_blank" rel="noreferrer">
        <WhatsAppIcon />
        <span><small>WhatsApp</small><strong dir="ltr">+972 50 332 9996</strong></span>
      </a>
    </div>
  </>;
}

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path fill="currentColor" d="M12 2a9.8 9.8 0 0 0-8.37 14.9L2.5 21.5l4.75-1.25A9.8 9.8 0 1 0 12 2Z" />
    <path fill="#fff" d="M16.88 14.2c-.27-.14-1.6-.79-1.84-.88-.25-.1-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07a7.36 7.36 0 0 1-2.16-1.33 8.1 8.1 0 0 1-1.5-1.87c-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.1-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.66 1.11 2.84c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.58.66.21 1.26.18 1.74.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32Z" />
  </svg>;
}

export function PublicSite({ page, locale, onLocale, onNavigate, onSignIn, accountName, onSettings, onSignOut }: PublicSiteProps) {
  const [languageOpen, setLanguageOpen] = useState(false);
  return <div className="marketing-shell" lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
    <Header locale={locale} onOpenLanguage={() => setLanguageOpen(true)} onNavigate={onNavigate} onSignIn={onSignIn} accountName={accountName} onSettings={onSettings} onSignOut={onSignOut} />
    <main>{page === "landing" ? <Landing locale={locale} onNavigate={onNavigate} onSignIn={onSignIn} /> : <LegalPage page={page} locale={locale} />}</main>
    <Footer locale={locale} onNavigate={onNavigate} />
    {languageOpen && <LanguagePicker locale={locale} onClose={() => setLanguageOpen(false)} onSelect={(nextLocale) => { onLocale(nextLocale); setLanguageOpen(false); }} />}
  </div>;
}

export function HelpLegalPanel({ locale, onNavigate, onClose }: { locale: PublicLocale; onNavigate: (path: string) => void; onClose: () => void }) {
  const he = locale === "he";
  return <div className="help-legal-panel" role="dialog" aria-modal="true" aria-label={he ? "עזרה ומשפטי" : "Help and legal"} dir={he ? "rtl" : "ltr"}>
    <div><div><p className="marketing-eyebrow">{he ? "עזרה ומשפטי" : "HELP & LEGAL"}</p><h2>{he ? "עזרה למרחב המשפחתי שלכם." : "Help for your family space."}</h2></div><button className="icon-button" onClick={onClose} aria-label={he ? "סגירת עזרה ומשפטי" : "Close help and legal"}>×</button></div>
    <p>{he ? "מידע על המוצר ודפים משפטיים זמינים מכל מקום ב-Feedme." : "Reach the product information and legal pages from anywhere in Feedme."}</p>
    <div className="help-legal-links"><button onClick={() => onNavigate("/contact")}><Users size={18} /> {he ? "יצירת קשר ותמיכה" : "Contact & support"}<ChevronRight size={17} /></button>{trustLinks(locale).map(([label, path]) => <button key={path} onClick={() => onNavigate(path)}>{path === "/privacy" ? <LockKeyhole size={18} /> : path === "/terms" ? <FileText size={18} /> : path === "/accessibility" ? <Eye size={18} /> : <ShieldCheck size={18} />} {label}<ChevronRight size={17} /></button>)}</div>
  </div>;
}
