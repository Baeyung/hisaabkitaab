import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

/**
 * Public landing page (/info). Self-contained marketing page — no backend.
 * The one moving part is the khaata book that opens on scroll over a pinned
 * desk, after which each feature is revealed as its own ledger page. Motion is
 * progressive enhancement: prefers-reduced-motion gets the whole page statically.
 *
 * The scroll motion is driven from here rather than by CSS scroll timelines
 * (animation-timeline/view()), which only Chromium ships in practice — on
 * Safari, iOS and Android the book stayed shut. `track()` writes two numbers
 * onto the host and info.css does the rest in calc(), so the animation is the
 * same whether the reader uses a wheel, a trackpad or a thumb.
 *
 * Bilingual without touching the app dictionary: the marketing copy lives here
 * as two objects and follows LocaleService, so the language toggle at the top
 * flips this page AND carries the choice into login/signup (the service stamps
 * <html dir/lang> and persists it). The book itself re-binds on the RTL edge
 * for Urdu, the way a real khaata opens.
 */
@Component({
  selector: 'app-info',
  imports: [RouterLink, SiteFooter],
  templateUrl: './info.html',
  styleUrl: './info.css',
  host: {
    '[attr.dir]': 'locale.dir()',
    '[attr.lang]': 'locale.locale()',
    '(window:scroll)': 'track()',
    '(window:resize)': 'track()',
  },
})
export class Info {
  protected readonly locale = inject(LocaleService);
  protected readonly c = computed(() => (this.locale.locale() === 'ur' ? UR : EN));

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private queued = false;

  constructor() {
    afterNextRender(() => {
      this.track();
      // reveal each chapter once, as it comes up the page
      const seen = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add('in');
            seen.unobserve(e.target);
          }),
        { rootMargin: '0px 0px -12% 0px' },
      );
      this.host.querySelectorAll('.reveal').forEach((el) => seen.observe(el));
      this.destroyRef.onDestroy(() => seen.disconnect());
    });
  }

  /**
   * Writes the scroll playhead the stylesheet animates against, one frame at a
   * time. --p is 0→1 across the desk's scroll (its height minus the pinned
   * screen, i.e. exactly how far the sticky pin travels); --navp is 0→1 over
   * the last stretch of desk, flipping the rail's cream to ink just before the
   * light paper slides under it. Measured in real pixels, so a phone's
   * collapsing URL bar can't skew it the way vh-based ranges did.
   */
  protected track(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      const stage = this.host.querySelector<HTMLElement>('.stage');
      const pin = this.host.querySelector<HTMLElement>('.stage__pin');
      if (!stage || !pin) return;
      const y = window.scrollY;
      const travel = Math.max(1, stage.offsetHeight - pin.offsetHeight);
      const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
      this.host.style.setProperty('--p', `${clamp01(y / travel)}`);
      // finishes with ~64px of desk left, i.e. as the rail's own height clears it
      this.host.style.setProperty('--navp', `${clamp01((y - stage.offsetHeight + 184) / 120)}`);
    });
  }
}

// Landing copy. English-primary; Urdu is a full translation so a shopkeeper who
// doesn't read English still gets the whole page. Rupee figures, refs and dates
// that carry across scripts stay in the template.
const EN = {
  toggle: 'اردو',
  login: 'Log in',
  eyebrow: 'For the register behind the counter',
  heroLede: 'The khaata book your shop already trusts — now it adds itself up.',
  scrollCue: 'Scroll to open',
  phoneAdd: 'Add entry',
  intro: 'Five things every shopkeeper keeps in that book. Here they keep themselves.',

  khataTitle: "Every customer's udhaar, remembered",
  khataBody:
    'Who owes you, who you owe, and the running baqaya on each name — carried forward on its own, never re-added by hand.',
  khataName: 'Rana Cloth House',
  khataBaqaya: 'Baqaya Rs 12,400',
  khataR1: 'Sold Lawn Print × 12',
  khataR2: 'Received on account',
  khataR3: 'Sold Voile × 6',
  // a second name, written on the same page — only the endpaper shows these
  khataName2: 'Bilal Traders',
  khataR4: 'Sold Khaddar × 8',
  khataR5: 'Received cash',
  khataName3: 'Nadeem Fabrics',
  khataR6: 'Sold Cambric × 15',
  khataR7: 'Received on account',
  khataName4: 'Shahzad & Sons',
  khataR8: 'Sold Silk × 3',
  khataR9: 'Advance received',

  roznTitle: "The day's cash, first sale to last",
  roznBody:
    'Opening in the morning, every receipt and payment through the day, closing that ties out at night. The roznamcha, kept without a pencil.',
  roznDay: 'Today · 27 Jul',
  roznClosing: 'Closing Rs 18,650',
  roznR1: 'Opening cash',
  roznR2: 'Received from Ahsan',
  roznR3: 'Chai & bijli',

  billTitle: 'A proper bill, not a torn slip',
  billBody:
    "Itemised invoices under your shop's name — print one for the counter or share it on the phone. Paid-off bills mark themselves.",
  billNo: 'Bill #4471',
  billPaid: 'Paid',
  billR1: 'Cambric × 20 m',
  billR2: 'Silk lining × 4',
  billTotal: 'Total',

  stockTitle: 'Know the shelf without counting it',
  stockBody:
    'Stock moves as you sell and buy — quantities on hand, and a quiet nudge when a line is running low.',
  stockHead: 'In stock',
  stockCount: '14 items',
  stockR1: 'Lawn Print',
  stockR2: 'Voile',
  stockR2qty: '6 m · low',
  stockR3: 'Cambric',

  dashTitle: 'The month, in one honest look',
  dashBody:
    "Revenue and spending, cash in the drawer, what's still owed to you and by you — added up the way you'd check it yourself.",
  dashHead: 'This month',
  dashR1: 'Revenue',
  dashR2: 'Spending',
  dashR3: 'Receivable',

  ctaTitle: 'Open your digital khaata',
  ctaBody: 'Free to start. Your book, on every device, adding itself up.',
  ctaGo: 'Get started',
  ctaHave: 'I already have one',
  footNote: 'Everything written down, remembered.',

  pricingKicker: 'Pricing',
  pricingTitle: 'Simple plans for every shop',
  pricingSubtitle: 'Pick the plan that fits your counter. Upgrade anytime.',
  planStandard: 'Standard',
  planPremium: 'Premium',
  planCorporate: 'Corporate',
  planPeriod: '/ month',
  planTrial: '1-month free trial included',
  planPopular: 'Most Popular',
  planCta: 'Get started',
  featKhata: 'Khata & udhaar tracking',
  featRozn: 'Roznamcha (daily cashbook)',
  featBills: 'Itemised bills',
  featStock: 'Inventory management',
  featDash: 'Dashboard & reports',
  featAllStd: 'Everything in Standard',
  featWhatsApp: 'WhatsApp reporting',
  featAllPrm: 'Everything in Premium',
  featEmail: 'Email reporting',
  featMaxWa: 'Maximum WhatsApp coverage — bills & every feature',
};

const UR: typeof EN = {
  toggle: 'English',
  login: 'لاگ اِن',
  eyebrow: 'دکان کے کاؤنٹر والا رجسٹر',
  heroLede: 'وہی کھاتہ کتاب جس پر آپ کی دکان بھروسہ کرتی ہے — اب خود حساب بھی رکھتی ہے۔',
  scrollCue: 'کھولنے کے لیے سکرول کریں',
  phoneAdd: 'نئی انٹری',
  intro: 'پانچ چیزیں جو ہر دکاندار اُس کتاب میں رکھتا ہے۔ یہاں یہ خود کو سنبھال لیتی ہیں۔',

  khataTitle: 'ہر گاہک کا اُدھار، یاد رکھا ہوا',
  khataBody:
    'کس نے آپ کا دینا ہے، کس کا آپ نے — اور ہر نام پر چلتا ہوا بقایا، خود آگے بڑھتا ہوا، ہاتھ سے دوبارہ جوڑنے کی ضرورت نہیں۔',
  khataName: 'رانا کلاتھ ہاؤس',
  khataBaqaya: 'بقایا Rs 12,400',
  khataR1: 'لان پرنٹ × 12 فروخت',
  khataR2: 'کھاتے میں وصول',
  khataR3: 'وائل × 6 فروخت',
  khataName2: 'بلال ٹریڈرز',
  khataR4: 'کھدر × 8 فروخت',
  khataR5: 'نقد وصول',
  khataName3: 'ندیم فیبرکس',
  khataR6: 'کیمبرک × 15 فروخت',
  khataR7: 'کھاتے میں وصول',
  khataName4: 'شہزاد اینڈ سنز',
  khataR8: 'سلک × 3 فروخت',
  khataR9: 'بیعانہ وصول',

  roznTitle: 'دن کی نقدی، پہلی سے آخری بکری تک',
  roznBody:
    'صبح کی اوپننگ، دن بھر کی وصولی اور ادائیگی، اور رات کی کلوزنگ جو خود مل جاتی ہے۔ روزنامچہ، بغیر پنسل کے۔',
  roznDay: 'آج · 27 جولائی',
  roznClosing: 'کلوزنگ Rs 18,650',
  roznR1: 'اوپننگ نقدی',
  roznR2: 'احسن سے وصول',
  roznR3: 'چائے اور بجلی',

  billTitle: 'پھٹی پرچی نہیں، پورا بل',
  billBody:
    'آپ کی دکان کے نام پر تفصیلی بل — کاؤنٹر کے لیے پرنٹ کریں یا فون پر بھیجیں۔ ادا شدہ بل خود نشان لگا لیتے ہیں۔',
  billNo: 'بل #4471',
  billPaid: 'ادا شدہ',
  billR1: 'کیمبرک × 20 میٹر',
  billR2: 'سلک لائننگ × 4',
  billTotal: 'کل',

  stockTitle: 'گنے بغیر جانیں شیلف پر کیا ہے',
  stockBody:
    'جیسے جیسے آپ بیچتے اور خریدتے ہیں، مال خود گھٹتا بڑھتا ہے — کتنا موجود ہے، اور کوئی چیز کم ہو تو خاموش اشارہ۔',
  stockHead: 'موجود مال',
  stockCount: '14 اشیاء',
  stockR1: 'لان پرنٹ',
  stockR2: 'وائل',
  stockR2qty: '6 میٹر · کم',
  stockR3: 'کیمبرک',

  dashTitle: 'پورا مہینہ، ایک سچی نظر میں',
  dashBody:
    'آمدن اور خرچ، گلّے کی نقدی، آپ کا کتنا لینا ہے اور کتنا دینا — بالکل ویسے جوڑ کر جیسے آپ خود دیکھتے۔',
  dashHead: 'اِس مہینے',
  dashR1: 'آمدن',
  dashR2: 'خرچ',
  dashR3: 'لینا (وصولی)',

  ctaTitle: 'اپنا ڈیجیٹل کھاتہ کھولیں',
  ctaBody: 'شروع کرنا مفت۔ آپ کی کتاب، ہر ڈیوائس پر، خود حساب رکھتی ہوئی۔',
  ctaGo: 'شروع کریں',
  ctaHave: 'میرا اکاؤنٹ پہلے سے ہے',
  footNote: 'جو لکھا، سو یاد رہا۔',

  pricingKicker: 'قیمت',
  pricingTitle: 'ہر دکان کے لیے سادہ پلان',
  pricingSubtitle: 'اپنے کاؤنٹر کے مطابق پلان منتخب کریں۔ کسی بھی وقت اپگریڈ کریں۔',
  planStandard: 'سٹینڈرڈ',
  planPremium: 'پریمیم',
  planCorporate: 'کارپوریٹ',
  planPeriod: '/ مہینہ',
  planTrial: '1 مہینے کا مفت ٹرائل شامل ہے',
  planPopular: 'سب سے مقبول',
  planCta: 'شروع کریں',
  featKhata: 'کھاتہ اور اُدھار کا حساب',
  featRozn: 'روزنامچہ (روزانہ نقد بہی)',
  featBills: 'تفصیلی بل',
  featStock: 'مال کا انتظام',
  featDash: 'ڈیش بورڈ اور رپورٹس',
  featAllStd: 'سٹینڈرڈ کی تمام سہولیات',
  featWhatsApp: 'واٹس ایپ رپورٹنگ',
  featAllPrm: 'پریمیم کی تمام سہولیات',
  featEmail: 'ای میل رپورٹنگ',
  featMaxWa: ' واٹس ایپ کی مکمل سہولت — بل اور ہر فیچر',
};
