import type { components } from '../../api/schema';
import {
  CUSTOMERS,
  DELIVERY_OPTIONS,
  OWNER,
  PRODUCTS,
  SHOP,
  STAFF,
  conversationIdOf,
  minutesAgo,
  type CastCustomer,
  type CastProduct,
} from '../cast';
import { DemoError, notFound, on } from '../router';
import { emitInboxSignal } from '../stream';
import { allProducts } from './catalog';
import { ordersOfCustomer } from './orders';

// Owner: inbox-agent. Conversations, messages, drafts, customers, conversation context.
// One Messenger conversation per customer in the cast. State lives in module scope so a write
// followed by a read returns the new value; a reload starts the demo over. Everything is synthetic.

type S = components['schemas'];
type Conversation = S['ConversationRead'];
type Message = S['MessageRead'];
type Draft = S['DraftRead'];
type Context = S['ConversationContext'];
type Proposal = S['OrderProposalRead'];
type Preparation = S['OrderPreparationRead'];
type Activity = S['AgentActivityRead'];
type Assignee = S['AssigneeRead'];
type Address = S['AddressRead'];
type Lang = 'bn' | 'bg' | 'en';

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------------------------
// Catalog helpers: prices and stock come from the live catalog when it knows the product, and
// from the cast otherwise, so the drafts quote what the Products page shows.
// ---------------------------------------------------------------------------------------------

const liveProduct = (p: CastProduct) => allProducts().find((x) => x.id === p.id) ?? null;

const priceMinor = (p: CastProduct) => liveProduct(p)?.variants[0]?.price_minor ?? p.priceMinor;

type Filter = Record<string, string>;

const variantsOf = (p: CastProduct, filter: Filter = {}) =>
  p.variants.filter((v) => Object.entries(filter).every(([key, value]) => v.options[key] === value));

const variantStock = (p: CastProduct, stock: number) =>
  liveProduct(p)?.stock?.state === 'out' ? 0 : stock;

const stockOf = (p: CastProduct, filter: Filter = {}) =>
  variantsOf(p, filter).reduce((sum, v) => sum + variantStock(p, v.stock), 0);

const labelOf = (options: Record<string, string>) => Object.values(options).join(', ');

function productNamed(name: string): CastProduct {
  const found = PRODUCTS.find((p) => p.name === name) ?? PRODUCTS[0];
  if (!found) throw new Error('The demo catalog is empty.');
  return found;
}

const digitsBn = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);
const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));

function taka(minor: number, lang: Lang) {
  const text = Math.round(minor / 100).toLocaleString('en-US');
  return `৳${lang === 'bn' ? digitsBn(text) : text}`;
}
const num = (n: number, lang: Lang) => (lang === 'bn' ? digitsBn(String(n)) : String(n));
const pick = (lang: Lang, bn: string, bg: string, en: string) =>
  lang === 'bn' ? bn : lang === 'bg' ? bg : en;

const INSIDE = DELIVERY_OPTIONS[0];
const OUTSIDE = DELIVERY_OPTIONS[1];

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

interface Thread {
  customer: CastCustomer;
  index: number;
  createdAt: string;
  status: 'open' | 'closed';
  unread: number;
  aiPaused: boolean;
  needsHuman: boolean;
  escalation: string | null;
  assignee: Assignee | null;
  assignedAt: string | null;
  assignedBy: Assignee | null;
  snoozedUntil: string | null;
  snoozeNote: string | null;
  takeoverDeadline: string | null;
  takeoverMinutes: number | null;
  chaseReason: string | null;
  chaseAt: string | null;
  activity: Activity | null;
  messages: Message[]; // oldest first
  draft: Draft | null;
  draftCount: number;
  proposal: Proposal | null;
  preparation: Preparation | null;
  discarded: boolean;
}

interface CustomerState {
  name: string | null;
  phone: string | null;
  gender: 'male' | 'female' | null;
  notes: string | null;
  locale: 'bn' | 'en';
  addresses: Address[];
  advancePolicy: 'delivery_fee' | 'fixed' | 'full' | null;
  advanceFixed: number | null;
  createdAt: string;
  updatedAt: string;
}

const threads = new Map<string, Thread>();
const customers = new Map<string, CustomerState>();
const networkChecks = new Map<string, string>();
let seeded = false;
let counter = 0;

const nextId = (kind: '5' | '6' | '7') =>
  `0197a000-0000-7000-8${kind}00-${String(++counter).padStart(12, '0')}`;

const asAssignee = (user: { id: string; name: string }): Assignee => ({ id: user.id, name: user.name });
const ME = asAssignee(OWNER);
const STAFF_ASSIGNEE = asAssignee(STAFF);

function makeMessage(
  conversationId: string,
  direction: 'in' | 'out',
  author: string,
  text: string | null,
  sentAt: string,
  over: Partial<Message> = {},
): Message {
  return {
    attachments: [],
    author,
    conversation_id: conversationId,
    delivered_at: direction === 'out' ? sentAt : null,
    direction,
    error: null,
    from_draft: false,
    id: nextId('5'),
    payload: null,
    quick_replies: [],
    read_at: null,
    send_status: direction === 'out' ? 'sent' : null,
    sent_at: sentAt,
    template: null,
    text,
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------
// Language and product detection, used to write a draft for a message nobody scripted
// ---------------------------------------------------------------------------------------------

const BANGLISH =
  /\b(ache|achhe|nai|nei|koto|kto|dam|lagbe|chai|chaile|bhai|bhaiya|apu|apa|ki|kemon|korte|korbo|dibo|dite|pabo|pai|taka|nibo|nite|ekta|ar|ami|amar|apnar|hobe|hoy|kore|din|vai|boro|valo|thik|accha|jani|ekhon|pathan|pathabo)\b/gi;

function detectLang(text: string): Lang {
  const letters = text.match(/\p{L}/gu) ?? [];
  const bangla = letters.filter((c) => /[ঀ-৿]/.test(c)).length;
  if (letters.length > 0 && bangla / letters.length > 0.3) return 'bn';
  return (text.match(BANGLISH)?.length ?? 0) >= 2 ? 'bg' : 'en';
}

const KEYWORDS: [RegExp, string][] = [
  [/panjabi|punjabi|পাঞ্জাবি|পাঞ্জাবী/i, 'Cotton Panjabi'],
  [/jamdani|জামদানি|saree|sari|শাড়ি/i, 'জামদানি শাড়ি'],
  [/linen|shirt|শার্ট/i, 'Linen Shirt'],
  [/three.?piece|3.?piece|thri.?piece|থ্রি.?পিস|lawn|লন/i, 'থ্রি-পিস (লন)'],
  [/denim|jacket|জ্যাকেট/i, 'Denim Jacket'],
  [/scarf|স্কার্ফ/i, 'Silk Scarf'],
  [/ওড়না|orna|dupatta/i, 'সুতি ওড়না'],
  [/wallet|ওয়ালেট/i, 'Leather Wallet'],
  [/handbag|hand bag|\bbag\b|ব্যাগ/i, 'Handbag'],
  [/sandal|kolhapuri|স্যান্ডেল|কোলাপুরি/i, 'Kolhapuri Sandals'],
  [/cream|ক্রিম/i, 'Rose Face Cream'],
  [/mehedi|mehendi|মেহেদি|মেহেন্দি/i, 'মেহেদি কোন'],
  [/earring|jhumka|ঝুমকা|কানের দুল/i, 'Gold-plated Earrings'],
  [/earbud|airbud|ইয়ারবাড/i, 'Wireless Earbuds'],
  [/amsh?otto|আমসত্ত্ব|আমসত্ত/i, 'আমসত্ত্ব (৫০০ গ্রাম)'],
];

function findProduct(texts: string[]): CastProduct | null {
  for (const text of texts) {
    for (const [pattern, name] of KEYWORDS) {
      if (pattern.test(text)) return PRODUCTS.find((p) => p.name === name) ?? null;
    }
  }
  return null;
}

const COLOUR_WORDS: [RegExp, string][] = [
  [/সাদা|white/i, 'White'],
  [/নেভি|navy|dark blue/i, 'Navy'],
  [/কালো|black/i, 'Black'],
  [/বাদামি|brown/i, 'Brown'],
];

/** The options the customer named for this product, e.g. `{ Size: 'L', Colour: 'Navy' }`. */
function filterFrom(p: CastProduct, raw: string): Filter {
  const text = asciiDigits(raw);
  const filter: Filter = {};
  for (const [name, values] of Object.entries(p.options)) {
    for (const value of values) {
      const lower = value.toLowerCase();
      let hit = false;
      if (['M', 'L', 'XL'].includes(value)) {
        hit =
          new RegExp(`(?<![A-Za-z'’])${value}(?![A-Za-z'’])`).test(text) ||
          new RegExp(
            `(?<![a-z'’])${lower}\\s*(?:size|সাইজ)|(?:size|সাইজ)\\s*[:-]?\\s*${lower}(?![a-z])`,
            'i',
          ).test(text);
      } else if (/^\d+$/.test(value)) {
        hit = new RegExp(`(?<!\\d)${value}(?!\\d)`).test(text);
      } else {
        hit = text.toLowerCase().includes(lower);
        for (const [pattern, canonical] of COLOUR_WORDS) {
          if (canonical === value && pattern.test(text)) hit = true;
        }
      }
      if (hit) filter[name] = value;
    }
  }
  return filter;
}

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------

interface Seed {
  text: string;
  intent: string;
  needsHuman?: boolean;
  handoffReason?: string | null;
  handoffNote?: string | null;
  product?: CastProduct;
  /** Every product the draft mentions, for its cards; `product` is the first. */
  products?: CastProduct[];
  filter?: Filter;
  proposal?: boolean;
  /** The agent's own order proposal; when present it is used as given (after checks). */
  agentProposal?: AgentProposal;
  confidence?: number;
  flags?: string[];
}

const customerOf = (t: Thread) => {
  const state = customers.get(t.customer.id);
  if (!state) throw notFound('Customer');
  return state;
};

const honorific = (t: Thread, lang: Lang) => {
  const female = customerOf(t).gender !== 'male';
  return female ? pick(lang, 'আপু', 'Apu', 'there') : pick(lang, 'ভাইয়া', 'Bhaiya', 'there');
};

const firstName = (t: Thread) => {
  const name = customerOf(t).name ?? '';
  return /^[A-Za-z]/.test(name) ? (name.split(' ')[0] ?? '') : '';
};

function productLine(p: CastProduct, filter: Filter, lang: Lang): string {
  const price = taka(priceMinor(p), lang);
  const groups = Object.keys(p.options).length;
  if (groups === 0) {
    const stock = stockOf(p);
    return stock > 0
      ? pick(
          lang,
          `${p.name} স্টকে আছে (${num(stock, lang)}টি), দাম ${price}।`,
          `${p.name} stock-e ache (${stock} ta), price ${price}.`,
          `${p.name} is in stock (${stock} available) at ${price}.`,
        )
      : pick(
          lang,
          `${p.name} এই মুহূর্তে স্টকে নেই। স্টক এলে আপনাকে জানাব।`,
          `${p.name} ekhon stock-e nei. Stock ashle janiye dibo.`,
          `${p.name} is out of stock right now. We will let you know when it is back.`,
        );
  }
  if (Object.keys(filter).length === groups) {
    const stock = stockOf(p, filter);
    const label = labelOf(filter);
    if (stock > 0) {
      return pick(
        lang,
        `${p.name} (${label}) স্টকে আছে, ${num(stock, lang)}টি। দাম ${price}।`,
        `${p.name} (${label}) ache, ${stock} ta stock-e. Price ${price}.`,
        `${p.name} (${label}) is in stock, ${stock} left, at ${price}.`,
      );
    }
    const alt = variantsOf(p)
      .filter((v) => variantStock(p, v.stock) > 0)
      .filter((v) => Object.entries(filter).some(([k, val]) => v.options[k] === val))
      .slice(0, 2)
      .map((v) => `${labelOf(v.options)} (${variantStock(p, v.stock)})`)
      .join(', ');
    return alt
      ? pick(
          lang,
          `${p.name} (${label}) এই মুহূর্তে স্টকে নেই। তবে এগুলো আছে: ${alt}। দাম ${price}।`,
          `${p.name} (${label}) ekhon stock-e nei. Tobe ei gulo ache: ${alt}. Price ${price}.`,
          `${p.name} (${label}) is out of stock right now. We do have: ${alt}, at ${price}.`,
        )
      : pick(
          lang,
          `${p.name} (${label}) এই মুহূর্তে স্টকে নেই।`,
          `${p.name} (${label}) ekhon stock-e nei.`,
          `${p.name} (${label}) is out of stock right now.`,
        );
  }
  const available = Object.entries(p.options)
    .map(([name, values]) => {
      const inStock = values.filter((value) => stockOf(p, { ...filter, [name]: value }) > 0);
      return inStock.length ? `${name}: ${inStock.join(', ')}` : null;
    })
    .filter((line): line is string => line !== null);
  if (available.length === 0) {
    return pick(
      lang,
      `${p.name} এই মুহূর্তে স্টকে নেই।`,
      `${p.name} ekhon stock-e nei.`,
      `${p.name} is out of stock right now.`,
    );
  }
  return pick(
    lang,
    `${p.name} আছে, দাম ${price}। স্টকে আছে: ${available.join('; ')}।`,
    `${p.name} ache, price ${price}. Stock-e ache: ${available.join('; ')}.`,
    `${p.name} is ${price}. In stock: ${available.join('; ')}.`,
  );
}

function deliveryLine(t: Thread, text: string, lang: Lang): string {
  const outsideNamed =
    /chattogram|chittagong|ctg|চট্টগ্রাম|sylhet|সিলেট|khulna|খুলনা|rajshahi|রাজশাহী|rangpur|রংপুর|barishal|বরিশাল|cumilla|কুমিল্লা|outside dhaka|ঢাকার বাইরে/i.test(
      text,
    );
  const dhakaNamed = /dhaka|ঢাকা|mirpur|uttara|dhanmondi|বসুন্ধরা|মিরপুর|উত্তরা/i.test(text);
  const outside = outsideNamed || (!dhakaNamed && customerOf(t).addresses[0]?.district !== 'Dhaka');
  const option = outside ? OUTSIDE : INSIDE;
  const [from = '1', to = '2'] = option.days.split('-');
  const zone = outside
    ? pick(lang, 'ঢাকার বাইরে', 'Dhaka-r baire', 'outside Dhaka')
    : pick(lang, 'ঢাকার ভেতরে', 'Dhaka-r bhitore', 'inside Dhaka');
  const fee = taka(option.feeMinor, lang);
  return pick(
    lang,
    `${zone} ডেলিভারি চার্জ ${fee}, ${digitsBn(from)}-${digitsBn(to)} দিনের মধ্যে পৌঁছে যাবে।`,
    `${zone} delivery charge ${fee}, ${option.days} din-er moddhe pouche jabe.`,
    `Delivery ${zone} is ${fee} and takes ${option.days} days.`,
  );
}

const paymentLine = (lang: Lang) =>
  pick(
    lang,
    'ক্যাশ অন ডেলিভারি চলবে, চাইলে বিকাশ বা নগদেও পেমেন্ট করতে পারেন।',
    'Cash on delivery hobe, chaile bKash ba Nagad-eo payment korte paren.',
    'Cash on delivery is available, and you can also pay with bKash or Nagad.',
  );

const orderAskLine = (lang: Lang) =>
  pick(
    lang,
    'অর্ডার করতে আপনার নাম, মোবাইল নম্বর আর পূর্ণ ঠিকানা (জেলা, এলাকা, বাড়ি/রোড) জানাবেন।',
    'Order korte apnar naam, phone number ar puro address (district, area, bari/road) bole din.',
    'To place the order, please share your full name, phone number and delivery address.',
  );

/** Compose a draft from the customer's last messages when nobody scripted one for them. */
function compose(t: Thread, hint: string | null): Seed {
  const inbound = t.messages.filter((m) => m.direction === 'in');
  const last = inbound.at(-1)?.text ?? '';
  const lang = detectLang(last);
  const recent = asciiDigits(
    inbound
      .slice(-2)
      .map((m) => m.text ?? '')
      .join(' \n '),
  );
  const product = findProduct(
    inbound
      .slice(-4)
      .reverse()
      .map((m) => m.text ?? ''),
  );
  const filter = product
    ? filterFrom(
        product,
        inbound
          .slice(-3)
          .map((m) => m.text ?? '')
          .join(' '),
      )
    : {};
  const wants = {
    price: /price|dam|দাম|koto|কত|how much/i.test(recent),
    stock: /ache|আছে|available|stock|স্টক|পাওয়া/i.test(recent),
    delivery: /deliver|ডেলিভারি|charge|চার্জ|shipping|courier|কুরিয়ার/i.test(recent),
    payment: /cod|cash|bkash|বিকাশ|nagad|নগদ|rocket|payment|পেমেন্ট/i.test(recent),
    order: /order|অর্ডার|nibo|nite|নিব|নিতে চাই|lagbe|লাগবে|চাই|buy/i.test(recent),
    complaint: /late|দেরি|পাইনি|পাই নাই|pai nai|still|এখনো|ekhono|delay|wrong|ভুল/i.test(recent),
    discount: /discount|offer|কম হবে|ছাড়|kome|কমে|negotiat/i.test(recent),
    details: /01\d{9}|address|ঠিকানা|thikana/i.test(recent),
  };
  const hon = honorific(t, lang);
  const first = firstName(t);
  const hi = pick(
    lang,
    /assalam|আসসালামু/i.test(recent) ? `ওয়ালাইকুম আসসালাম ${hon}!` : `জি ${hon},`,
    `Ji ${hon},`,
    first ? `Hi ${first}!` : 'Hi!',
  );
  const parts: string[] = [];
  let intent = 'product_inquiry';
  let needsHuman = false;
  let handoffReason: string | null = null;
  let proposal = false;

  if (wants.complaint) {
    intent = 'complaint';
    needsHuman = true;
    handoffReason = 'complaint';
    parts.push(
      pick(
        lang,
        'দেরির জন্য আন্তরিকভাবে দুঃখিত। আমরা এখনই কুরিয়ারের সাথে কথা বলে আপনাকে আপডেট জানাচ্ছি।',
        'Deri hoyechhe bole sorry. Amra ekhoni courier-er sathe kotha bole update janachhi.',
        'I am sorry about the delay. We are checking with the courier now and will update you shortly.',
      ),
    );
  } else if (wants.discount) {
    intent = 'negotiation';
    needsHuman = true;
    handoffReason = 'negotiation';
    parts.push(
      pick(
        lang,
        'দামটা আমাদের ফিক্সড, তবে একসাথে নিলে কিছু করা যায় কি না মালিকের সাথে কথা বলে জানাচ্ছি।',
        'Dam ta amader fixed, tobe ekshathe nile kichu kora jay kina owner-er sathe kotha bole janachhi.',
        'Our prices are fixed, but I will check with the owner whether we can do something on a bulk order.',
      ),
    );
    if (product) parts.push(productLine(product, filter, lang));
  } else {
    if (product && (wants.price || wants.stock || wants.order || !(wants.delivery || wants.payment))) {
      parts.push(productLine(product, filter, lang));
    }
    if (wants.delivery) parts.push(deliveryLine(t, recent, lang));
    if (wants.payment) parts.push(paymentLine(lang));
    if (wants.delivery) intent = 'delivery_inquiry';
    else if (wants.payment) intent = 'payment_inquiry';
    if (wants.order || wants.details) {
      intent = 'order_intent';
      needsHuman = true;
      handoffReason = 'order_intent';
      const chosen = product
        ? variantsOf(product, filter).some((v) => variantStock(product, v.stock) > 0)
        : false;
      if (wants.details && product && chosen) {
        proposal = true;
        parts.push(
          pick(
            lang,
            'আপনার তথ্যগুলো পেয়েছি। সব ঠিক থাকলে "হ্যাঁ" লিখে কনফার্ম করুন, আমরা অর্ডারটি পাঠানোর ব্যবস্থা করছি।',
            'Apnar tothyo peyechhi. Sob thik thakle "hya" likhe confirm korun, amra order ta pathanor babostha korchhi.',
            'Thanks, I have your details. Reply "yes" to confirm and we will get the order moving.',
          ),
        );
      } else {
        parts.push(orderAskLine(lang));
      }
    }
  }
  if (parts.length === 0) {
    parts.push(
      pick(
        lang,
        'বলুন কীভাবে সাহায্য করতে পারি? কোন পণ্যটি দেখতে চান জানালে দাম ও স্টক জানিয়ে দেব।',
        'Bolun kibhabe help korte pari? Kon product ta dekhte chan bolle dam ar stock janiye dibo.',
        'How can I help? Tell me which product you are looking at and I will share the price and stock.',
      ),
    );
  }
  if (hint) {
    const note = hint.trim().replace(/^[a-z]/, (c) => c.toUpperCase());
    parts.unshift(/[.!?।]$/.test(note) ? note : `${note}${lang === 'bn' ? '।' : '.'}`);
  }
  return {
    text: `${hi} ${parts.join(' ')}`,
    intent,
    needsHuman,
    handoffReason,
    product: product && !wants.complaint ? product : undefined,
    filter,
    proposal,
    confidence: 0.82,
  };
}

/** The hand-written drafts, per conversation (in cast order). Asking again shows the next one. */
const HAND: Record<number, ((t: Thread) => Seed)[]> = {
  0: [
    () => {
      const p = productNamed('Cotton Panjabi');
      const white = stockOf(p, { Size: 'L', Colour: 'White' });
      const navy = stockOf(p, { Size: 'L', Colour: 'Navy' });
      const price = taka(priceMinor(p), 'en');
      const ask = `Order korte apnar naam, phone number ar puro address ta bole din. Inside Dhaka delivery ${taka(INSIDE.feeMinor, 'en')}, COD-o hobe.`;
      const text =
        white > 0
          ? `Apu, L size White ache (${white} ta), price ${price}. ${ask}`
          : `Apu, L size-er White ta ekhon stock-e nei, sorry. Tobe L Navy ache (${navy} ta), price ${price}. Chaile Navy ta pathiye dei? ${ask}`;
      return {
        text,
        intent: 'availability_check',
        product: p,
        filter: { Size: 'L', Colour: white > 0 ? 'White' : 'Navy' },
      };
    },
    () => {
      const p = productNamed('Cotton Panjabi');
      return {
        text: `Apu, L White ta ekhon nei, tobe XL White ${stockOf(p, { Size: 'XL', Colour: 'White' })} ta ar L Navy ${stockOf(p, { Size: 'L', Colour: 'Navy' })} ta ache. Duitar-i price ${taka(priceMinor(p), 'en')}. Kon ta nite chan bolben, ami ekta hold kore rakhbo.`,
        intent: 'availability_check',
        product: p,
        filter: { Size: 'L', Colour: 'Navy' },
      };
    },
  ],
  1: [
    () => {
      const p = productNamed('Linen Shirt');
      return {
        text: `Hi Tanvir! Yes, we deliver to Chattogram. Delivery outside Dhaka is ${taka(OUTSIDE.feeMinor, 'en')} and usually takes ${OUTSIDE.days} days. Cash on delivery is available, and you can also pay with bKash or Nagad if you prefer. The Linen Shirt in Sand, size L is ${taka(priceMinor(p), 'en')} with ${stockOf(p, { Size: 'L', Colour: 'Sand' })} in stock. To place the order, please share your full name, phone number and delivery address.`,
        intent: 'delivery_inquiry',
        product: p,
        filter: { Size: 'L', Colour: 'Sand' },
      };
    },
    () => {
      const p = productNamed('Linen Shirt');
      return {
        text: `Hi Tanvir, quick update: the Linen Shirt (Sand, L) is available at ${taka(priceMinor(p), 'en')}. Delivery to Chattogram is ${taka(OUTSIDE.feeMinor, 'en')} (${OUTSIDE.days} days) and COD works. Send us your name, phone number and full address and we will get it ready today.`,
        intent: 'order_intent',
        product: p,
        filter: { Size: 'L', Colour: 'Sand' },
      };
    },
  ],
  2: [
    (t) => {
      const p = productNamed('জামদানি শাড়ি');
      const price = priceMinor(p);
      const c = customerOf(t);
      const phone = digitsBn((c.phone ?? '').replace('+88', ''));
      return {
        text: `ধন্যবাদ আপু! আপনার অর্ডারটি এরকম:\n১টা জামদানি শাড়ি (লাল): ${taka(price, 'bn')}\nডেলিভারি চার্জ (ঢাকার ভেতরে): ${taka(INSIDE.feeMinor, 'bn')}\nমোট: ${taka(price + INSIDE.feeMinor, 'bn')} (ক্যাশ অন ডেলিভারি)\n\nনাম: ${c.name ?? ''}\nফোন: ${phone}\nঠিকানা: ${digitsBn(c.addresses[0]?.raw_text ?? '')}\n\nসব ঠিক থাকলে "হ্যাঁ" লিখে কনফার্ম করুন, আমরা আজই পাঠানোর ব্যবস্থা করব।`,
        intent: 'order_intent',
        needsHuman: true,
        handoffReason: 'order_intent',
        handoffNote: 'The customer shared a name, phone and address. Check them, then create the order.',
        product: p,
        filter: { Colour: 'লাল' },
        proposal: true,
      };
    },
    () => {
      const p = productNamed('জামদানি শাড়ি');
      return {
        text: `আপু, লাল জামদানি শাড়িটা এখন ${num(stockOf(p, { Colour: 'লাল' }), 'bn')}টি আছে। আপনার অর্ডারটা আমি হোল্ড করে রাখছি। ঠিকানা আর নম্বর ঠিক আছে কি না একটু দেখে নিয়ে "হ্যাঁ" লিখবেন, তাহলেই কনফার্ম করে দেব।`,
        intent: 'order_intent',
        needsHuman: true,
        handoffReason: 'order_intent',
        product: p,
        filter: { Colour: 'লাল' },
        proposal: true,
      };
    },
  ],
  3: [
    () => ({
      text: 'ভাইয়া, দেরির জন্য আন্তরিকভাবে দুঃখিত। কুরিয়ারের সাথে আমরা এখনই কথা বলছি, আজ সন্ধ্যার মধ্যে আপনাকে ট্র্যাকিং আপডেট জানাব। অর্ডারটি ক্যান্সেল না করে আমাদের একটু সময় দিন, প্লিজ। আজ ডেলিভারি সম্ভব না হলে কী করা যায় সেটা আলাদা করে জানাব।',
      intent: 'complaint',
      needsHuman: true,
      handoffReason: 'complaint',
      handoffNote: 'The customer may cancel. Check with the courier before sending.',
    }),
    () => ({
      text: 'ভাইয়া, আপনার বিরক্তি বুঝতে পারছি, দুঃখিত। কুরিয়ার হাবে আমাদের লোক গিয়ে আপনার পার্সেলটা খুঁজে বের করছে। এক ঘণ্টার মধ্যে ফোনে আপনাকে জানাব।',
      intent: 'complaint',
      needsHuman: true,
      handoffReason: 'complaint',
    }),
  ],
  4: [
    () => {
      const p = productNamed('Handbag');
      return {
        text: `Hi Raisa! Of course, we would love to set a Tan Handbag aside for you (${stockOf(p, { Colour: 'Tan' })} in stock, ${taka(priceMinor(p), 'en')}). Message us any time after the 1st with your name, phone number and address and we will get it out to you.`,
        intent: 'follow_up',
        product: p,
        filter: { Colour: 'Tan' },
      };
    },
  ],
  5: [
    () => ({
      text: 'ভাইয়া, আপনাকেও অনেক ধন্যবাদ! কুরিয়ার বুকিং হলেই আপনাকে জানিয়ে দেব। আর কিছু লাগলে নির্দ্বিধায় বলবেন।',
      intent: 'thanks',
    }),
  ],
  6: [
    () => {
      const p = productNamed('থ্রি-পিস (লন)');
      return {
        text: `Apu, L size ta ekhon matro ${stockOf(p, { Size: 'L' })} ta ache, M size ${stockOf(p, { Size: 'M' })} ta. Price ${taka(priceMinor(p), 'en')}. Khulna te delivery ${taka(OUTSIDE.feeMinor, 'en')}, ${OUTSIDE.days} din lage. Order korte chaile janiye din, ami hold kore rakhbo.`,
        intent: 'availability_check',
        product: p,
        filter: { Size: 'L' },
      };
    },
  ],
  7: [
    () => {
      const p = productNamed('Wireless Earbuds');
      return {
        text: `Bhaiya, Wireless Earbuds Black er price ${taka(priceMinor(p), 'en')}. 2 ta nile discount dewa jabe kina ami owner-er sathe kotha bole janachhi. Denim Jacket ekhon stock-e nei, stock ashle sobar age apnake janabo.`,
        intent: 'negotiation',
        needsHuman: true,
        handoffReason: 'negotiation',
        handoffNote: 'Asked for 2 earbuds at ৳4,500 against the list price of ৳5,000. Decide on a discount.',
        product: p,
        filter: { Colour: 'Black' },
      };
    },
  ],
};

const proposalCustomer = (t: Thread): Proposal['customer'] => {
  const state = customerOf(t);
  const address = state.addresses.find((a) => a.is_default) ?? state.addresses[0];
  return {
    address_line: address?.line ?? null,
    address_raw: address?.raw_text ?? null,
    area: address?.area ?? null,
    district: address?.district ?? null,
    name: state.name,
    phone_e164: state.phone,
    phone_input: state.phone?.replace('+88', '') ?? null,
  };
};

/** Inside Dhaka by the customer's address, unless the message says outside. */
const deliveryFor = (t: Thread, text: string) => {
  const address = customerOf(t).addresses.find((a) => a.is_default) ?? customerOf(t).addresses[0];
  const outside = (address?.district ?? t.customer.district) !== 'Dhaka' || /outside/i.test(text);
  return outside ? OUTSIDE : INSIDE;
};

function buildProposal(
  t: Thread,
  p: CastProduct,
  filter: Filter,
  draftId: string,
  text: string,
): Proposal | null {
  const variant = variantsOf(p, filter).find((v) => variantStock(p, v.stock) > 0);
  if (!variant) return null;
  const unit = priceMinor(p);
  const option = deliveryFor(t, text);
  return {
    currency: 'BDT',
    customer: proposalCustomer(t),
    delivery_fee_minor: option.feeMinor,
    delivery_name: option.name,
    delivery_option_id: option.id,
    draft_id: draftId,
    issues: [],
    items: [
      {
        line_total_minor: unit,
        options: { ...variant.options },
        product_id: p.id,
        product_name: p.name,
        quantity: 1,
        unit_price_minor: unit,
        variant_id: variant.id,
      },
    ],
    missing: [],
    subtotal_minor: unit,
    total_minor: unit + option.feeMinor,
  };
}

// ---------------------------------------------------------------------------------------------
// The real agent (optional): with VITE_AGENT_URL set, drafts come from `POST {url}/draft`.
// Shapes follow agent/karbaar_agent/models.py. Any failure falls back to the scripted drafts.
// ---------------------------------------------------------------------------------------------

interface AgentReply {
  reply_text: string;
  intent: string;
  needs_human: boolean;
  handoff_reason: string | null;
  product_refs: string[];
  order_proposal: AgentProposal | null;
  flags: string[];
}

interface AgentProposal {
  lines: {
    product_id: string;
    variant_id: string;
    name?: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
  }[];
  subtotal_minor: number;
  delivery_option_id: string;
  delivery_fee_minor: number;
  total_minor: number;
}

function agentRequest(t: Thread, hint: string | null) {
  const state = customerOf(t);
  const address = state.addresses.find((a) => a.is_default) ?? state.addresses[0];
  return {
    shop_name: SHOP.name,
    catalog: allProducts().map((p) => {
      const cast = PRODUCTS.find((c) => c.id === p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        aliases: p.aliases,
        price_minor: p.variants[0]?.price_minor ?? 0,
        variants: p.variants
          .filter((v) => v.status === 'active')
          .map((v) => ({
            id: v.id,
            options: v.option_values,
            stock: cast ? variantStock(cast, cast.variants.find((c) => c.id === v.id)?.stock ?? 0) : 0,
            price_minor: v.price_minor,
          })),
      };
    }),
    delivery_options: DELIVERY_OPTIONS.map((o) => ({
      id: o.id,
      name: o.name,
      fee_minor: o.feeMinor,
      days: o.days,
      inside_dhaka: o.name === 'Inside Dhaka',
    })),
    conversation: t.messages
      .filter((m) => m.text)
      .map((m) => ({
        author: m.direction === 'in' ? 'customer' : m.author === 'agent' ? 'agent' : 'shop',
        text: m.text ?? '',
      })),
    customer: {
      name: state.name,
      phone: state.phone,
      district: address?.district ?? t.customer.district,
      area: address?.area ?? t.customer.area,
      address_line: address?.line ?? t.customer.addressLine,
    },
    hint,
  };
}

async function askAgent(url: string, request: ReturnType<typeof agentRequest>): Promise<AgentReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Agent answered ${response.status}`);
    return (await response.json()) as AgentReply;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The agent's order proposal as a demo proposal. Lines whose variant is not in the catalog are
 * dropped; prices and totals are recomputed from the catalog, and the catalog wins over the
 * agent's numbers when they differ. The delivery fee comes from the delivery option's catalog fee.
 */
function agentOrder(t: Thread, agent: AgentProposal, draftId: string, text: string): Proposal | null {
  const items: Proposal['items'] = [];
  for (const line of agent.lines) {
    const product = PRODUCTS.find((p) => p.id === line.product_id);
    const variant = product?.variants.find((v) => v.id === line.variant_id);
    const quantity = Math.trunc(line.quantity);
    if (!product || !variant || !(quantity >= 1)) {
      console.warn('Dropping an agent order line that is not in the catalog.', line);
      continue;
    }
    const unit = liveProduct(product)?.variants.find((v) => v.id === variant.id)?.price_minor ?? priceMinor(product);
    const total = unit * quantity;
    if (unit !== line.unit_price_minor || total !== line.line_total_minor || quantity !== line.quantity) {
      console.warn('Agent line numbers differ from the catalog; using the catalog.', line, { unit, quantity, total });
    }
    items.push({
      line_total_minor: total,
      options: { ...variant.options },
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_minor: unit,
      variant_id: variant.id,
    });
  }
  if (!items.length) return null;
  const known = DELIVERY_OPTIONS.find((o) => o.id === agent.delivery_option_id);
  if (!known) console.warn('Unknown delivery option from the agent; choosing by address.', agent.delivery_option_id);
  const option = known ?? deliveryFor(t, text);
  const subtotal = items.reduce((sum, i) => sum + i.line_total_minor, 0);
  const total = subtotal + option.feeMinor;
  if (
    subtotal !== agent.subtotal_minor ||
    option.feeMinor !== agent.delivery_fee_minor ||
    total !== agent.total_minor
  ) {
    console.warn('Agent order totals differ from the catalog; using the catalog.', agent, {
      subtotal,
      delivery_fee_minor: option.feeMinor,
      total,
    });
  }
  return {
    currency: 'BDT',
    customer: proposalCustomer(t),
    delivery_fee_minor: option.feeMinor,
    delivery_name: option.name,
    delivery_option_id: option.id,
    draft_id: draftId,
    issues: [],
    items,
    missing: [],
    subtotal_minor: subtotal,
    total_minor: total,
  };
}

/** The seed's `product` is the first line's product, else the first product ref; `products` has all. */
function seedFromAgent(reply: AgentReply): Seed {
  const agentProposal = reply.order_proposal ?? undefined;
  const line = agentProposal?.lines[0];
  const ids = [
    ...(agentProposal?.lines.map((l) => l.product_id) ?? []),
    ...reply.product_refs,
  ];
  const products = [...new Set(ids)]
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter((p): p is CastProduct => Boolean(p));
  const product = products[0];
  const variant = product?.variants.find((v) => v.id === line?.variant_id);
  return {
    text: reply.reply_text,
    intent: reply.intent,
    needsHuman: reply.needs_human,
    handoffReason: reply.handoff_reason,
    product,
    products,
    filter: variant ? { ...variant.options } : {},
    proposal: Boolean(agentProposal?.lines.length && product),
    agentProposal,
    flags: reply.flags,
  };
}

function makeDraft(t: Thread, seed: Seed, at: string): Draft {
  const trigger = [...t.messages].reverse().find((m) => m.direction === 'in');
  const id = nextId('6');
  const p = seed.product;
  const lang: Lang = detectLang(seed.text) === 'bn' ? 'bn' : 'en';
  const proposal = seed.agentProposal
    ? agentOrder(t, seed.agentProposal, id, seed.text)
    : p && seed.proposal
      ? buildProposal(t, p, seed.filter ?? {}, id, seed.text)
      : null;
  const shown = seed.products?.length ? seed.products : p ? [p] : [];
  if (proposal) t.proposal = proposal;
  const variantNote =
    p && seed.filter && Object.keys(seed.filter).length ? ` · ${labelOf(seed.filter)}` : '';
  return {
    cards: shown.map((card, i) => ({
      buttons: [],
      image_url: null,
      product_id: card.id,
      subtitle: `${taka(priceMinor(card), lang)}${i === 0 ? variantNote : ''}`,
      title: card.name,
    })),
    confidence: seed.confidence ?? 0.93,
    created_at: at,
    flags: (seed.flags ?? []).map((code) => ({ code, detail: '' })),
    handoff_note: seed.handoffNote ?? null,
    handoff_reason: seed.handoffReason ?? null,
    id,
    intent: seed.intent,
    needs_human: seed.needsHuman ?? false,
    order_proposal: proposal ? { ...proposal } : null,
    photos: [],
    product_refs: shown.map((x) => ({ name: x.name, product_id: x.id })),
    sources: [],
    text: seed.text,
    trigger_message_id: trigger?.id ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// Seeding: one scripted conversation per customer
// ---------------------------------------------------------------------------------------------

type Who = 'c' | 'a' | 'm' | 's';
type Line = [who: Who, text: string, minutesAgo: number];

function scripts(): Line[][] {
  const mahmudOrder = CUSTOMERS[3] ? ordersOfCustomer(CUSTOMERS[3].id)[0] : undefined;
  const ref = mahmudOrder ? ` #${mahmudOrder.number}` : '';
  const pj = productNamed('Cotton Panjabi');
  const lw = productNamed('Linen Shirt');
  const hb = productNamed('Handbag');
  const jam = productNamed('জামদানি শাড়ি');
  const eb = productNamed('Wireless Earbuds');
  const ks = productNamed('Kolhapuri Sandals');
  const tp = productNamed('থ্রি-পিস (লন)');
  const en = (p: CastProduct) => taka(priceMinor(p), 'en');
  const bn = (p: CastProduct) => taka(priceMinor(p), 'bn');
  return [
    // 0 Nusrat: Banglish, asking for L in white (out of stock). A draft is waiting.
    [
      ['c', 'Assalamu alaikum, apnader Cotton Panjabi ache?', 190],
      ['a', `Walaikum assalam apu! Ji, Cotton Panjabi ache. Size M, L, XL ar colour White, Navy. Price ${en(pj)}. Kon size lagbe?`, 189],
      ['c', 'Bhaiyer jonno lagbe, L size. White ta dekhte chai', 12],
      ['c', 'L white ache? Price koto?', 6],
    ],
    // 1 Tanvir: English, delivery to Chattogram and COD. No draft yet.
    [
      ['c', 'Hi, is the Linen Shirt available in Sand, size L?', 95],
      ['a', `Hello Tanvir! Yes, the Linen Shirt in Sand (L) is in stock at ${en(lw)}. Would you like to order it?`, 94],
      ['c', "Great. Do you deliver to Chattogram? What's the delivery charge?", 41],
      ['c', 'And is cash on delivery possible, or do I need to pay with bKash first?', 38],
    ],
    // 2 Sumaiya: Bangla, ready to order. The draft carries an order proposal.
    [
      ['c', 'আসসালামু আলাইকুম, জামদানি শাড়ি কি লাল রঙে আছে?', 300],
      ['a', `ওয়ালাইকুম আসসালাম আপু! জি, হাতে বোনা জামদানি লাল রঙে আছে, দাম ${bn(jam)}। ব্লাউজ পিস সহ।`, 299],
      ['c', 'ডেলিভারি চার্জ কত? বিকাশে পেমেন্ট করা যাবে?', 280],
      ['a', `ঢাকার ভেতরে ডেলিভারি চার্জ ${taka(INSIDE.feeMinor, 'bn')}, ১-২ দিনে পাবেন। ক্যাশ অন ডেলিভারি আর বিকাশ দুটোই চলবে আপু।`, 279],
      ['c', 'ঠিক আছে, আমি ১টা লাল জামদানি নিব। আমার নাম সুমাইয়া ইসলাম, নম্বর 01911000103', 22],
      ['c', 'ঠিকানা: সেক্টর ৭, রোড ১২, বাড়ি ৩০, উত্তরা, ঢাকা। ক্যাশ অন ডেলিভারি দিবেন', 20],
    ],
    // 3 Mahmudul: a late delivery. Assigned to Rakib.
    [
      ['c', `Bhai, amar order${ref} er tracking number ta pete pari?`, 4400],
      ['m', 'আসসালামু আলাইকুম ভাইয়া, আপনার অর্ডারটি কুরিয়ারে দেওয়া হয়েছে, ২-৩ দিনের মধ্যে পৌঁছে যাবে ইনশাআল্লাহ।', 4380],
      ['c', 'ভাই আজকে ৬ দিন হয়ে গেল, এখনো পাই নাই। কুরিয়ার ফোনও ধরছে না', 380],
      ['a', 'দুঃখিত ভাইয়া, দেরির জন্য ক্ষমা চাইছি। আমি বিষয়টি আমাদের টিমকে জানাচ্ছি, তারা আপনাকে শীঘ্রই জানাবে।', 379],
      ['s', 'The AI passed this conversation to the team: the customer complained.', 379],
      ['m', 'ভাইয়া, আমি রাকিব। আমি কুরিয়ারের সাথে কথা বলছি, আজকের মধ্যে আপডেট দিচ্ছি।', 330],
      ['c', `ঠিক আছে। আজকে না পেলে কিন্তু অর্ডার ক্যান্সেল করে টাকা ফেরত চাই।${ref}`, 25],
    ],
    // 4 Raisa: English, wants a handbag after the 1st. Snoozed.
    [
      ['c', 'Hi! Is the Handbag in Tan available? How much?', 3000],
      ['m', `Hi Raisa! Yes, the Handbag in Tan is ${en(hb)} and we have ${stockOf(hb, { Colour: 'Tan' })} in stock.`, 2990],
      ['c', "Love it. I'll order after my salary on the 1st, can you keep one aside?", 2980],
      ['m', "Sure! I'll make a note. Message us when you're ready and we'll set it aside.", 2975],
      ['c', 'Thanks! Will message you on the 1st.', 2970],
    ],
    // 5 Arif: Bangla, the AI answered, he ordered. Done.
    [
      ['c', 'ভাই কোলাপুরি স্যান্ডেল ৪২ সাইজ আছে? দাম কত?', 5000],
      ['a', `জি ভাইয়া, Kolhapuri Sandals ৪২ সাইজে আছে। দাম ${bn(ks)}। হাতে তৈরি চামড়ার স্যান্ডেল।`, 4999],
      ['c', 'ডেলিভারি রাজশাহীতে কত দিন লাগবে?', 4990],
      ['a', `রাজশাহীতে ঢাকার বাইরের চার্জ ${taka(OUTSIDE.feeMinor, 'bn')}, ৩-৫ দিনে পৌঁছে যাবে।`, 4989],
      ['c', 'ঠিক আছে অর্ডার দিয়ে দিলাম, নাম আরিফ হোসেন, ঠিকানা ঘোড়ামারা, শাহেব বাজার, রাজশাহী। 01311000106', 4970],
      ['m', 'ধন্যবাদ ভাইয়া! আপনার অর্ডার কনফার্ম করা হয়েছে। কুরিয়ার বুকিং হলে জানাব।', 4950],
      ['c', 'ধন্যবাদ ভাই', 4940],
    ],
    // 6 Sadia: Banglish, the 24-hour window has closed.
    [
      ['c', 'Apu Three piece (lawn) M size ache? koyta stock ache?', 3100],
      ['a', `Ji apu, Three-piece (lawn) M size ache. Price ${en(tp)}. Order korte chaile naam, phone ar address din.`, 3099],
      ['c', 'L size ta? Ar Khulna te delivery koto din lage?', 2600],
      ['m', `Apu, L size ekhon matro ${stockOf(tp, { Size: 'L' })} ta ache. Khulna te delivery ${taka(OUTSIDE.feeMinor, 'en')}, ${OUTSIDE.days} din lage. Order dite chaile janiye den, ami hold kore rakhbo.`, 2590],
    ],
    // 7 Imran: Banglish, asks for a discount. Needs the owner.
    [
      ['c', 'Bhai Wireless Earbuds Black price koto?', 75],
      ['a', `Bhaiya, Wireless Earbuds (Black) er price ${en(eb)}, stock-e ${stockOf(eb, { Colour: 'Black' })} ta ache. Bluetooth 5.3, 20 ghonta battery.`, 74],
      ['c', '2 ta nile kome dibe? 4500 e hobe?', 11],
      ['c', 'Ar ekta Denim Jacket o lagbe, L size', 9],
    ],
  ];
}

function seed() {
  if (seeded) return;
  seeded = true;
  const lines = scripts();
  const gender: ('male' | 'female')[] = ['female', 'male', 'female', 'male', 'female', 'male', 'female', 'male'];
  const bangla = [0, 2, 3, 5, 6, 7];
  const notes: Record<number, string> = {
    1: 'Prefers delivery to his office in Agrabad.',
    3: 'Complained about a late delivery. Rakib is following up with the courier.',
    4: 'Wants the Tan Handbag set aside until the 1st.',
  };
  const flags: Record<number, Partial<Thread>> = {
    0: { unread: 2 },
    1: { unread: 2 },
    2: { unread: 2, needsHuman: true, escalation: 'order_intent' },
    3: {
      unread: 1,
      needsHuman: true,
      escalation: 'complaint',
      assignee: STAFF_ASSIGNEE,
      assignedBy: ME,
      assignedAt: minutesAgo(340),
    },
    4: {
      snoozedUntil: minutesAgo(-4300),
      snoozeNote: 'Ordering the Tan Handbag after the 1st. Ask for her address.',
    },
    5: { status: 'closed' },
    7: { unread: 2, needsHuman: true, escalation: 'negotiation' },
  };

  CUSTOMERS.forEach((customer, i) => {
    const conversationId = conversationIdOf(customer.id);
    const script = lines[i] ?? [];
    const lastInbound = script.filter(([who]) => who === 'c').at(-1)?.[2] ?? 0;
    const messages = script.map(([who, text, ago]) => {
      const sentAt = minutesAgo(ago);
      if (who === 'c') return makeMessage(conversationId, 'in', 'customer', text, sentAt);
      const author = who === 'a' ? 'agent' : who === 'm' ? 'merchant' : 'system';
      const message = makeMessage(conversationId, 'out', author, text, sentAt);
      // The customer wrote after this one, so they have read it.
      if (ago > lastInbound) message.read_at = minutesAgo(ago - 1);
      return message;
    });
    const t: Thread = {
      customer,
      index: i,
      createdAt: minutesAgo((script[0]?.[2] ?? 60) + 5),
      status: 'open',
      unread: 0,
      aiPaused: false,
      needsHuman: false,
      escalation: null,
      assignee: null,
      assignedAt: null,
      assignedBy: null,
      snoozedUntil: null,
      snoozeNote: null,
      takeoverDeadline: null,
      takeoverMinutes: null,
      chaseReason: null,
      chaseAt: null,
      activity: null,
      messages,
      draft: null,
      draftCount: 0,
      proposal: null,
      preparation: null,
      discarded: false,
      ...flags[i],
    };
    threads.set(conversationId, t);
    customers.set(customer.id, {
      name: customer.name,
      phone: customer.phone,
      gender: gender[i] ?? null,
      notes: notes[i] ?? null,
      locale: bangla.includes(i) ? 'bn' : 'en',
      addresses: [
        {
          area: customer.area,
          created_at: minutesAgo(60 * 24 * 30),
          district: customer.district,
          id: nextId('7'),
          is_default: true,
          line: customer.addressLine,
          raw_text: `${customer.addressLine}, ${customer.area}, ${customer.district}`,
          updated_at: minutesAgo(60 * 24 * 30),
        },
      ],
      advancePolicy: null,
      advanceFixed: null,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
    });
  });

  // Drafts waiting for the merchant: Nusrat's availability answer and Sumaiya's order draft.
  for (const i of [0, 2]) {
    const customer = CUSTOMERS[i];
    const t = customer ? threads.get(conversationIdOf(customer.id)) : undefined;
    const make = HAND[i]?.[0];
    if (t && make) {
      t.draft = makeDraft(t, make(t), minutesAgo(i === 0 ? 5 : 19));
      t.draftCount = 1;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

function getThread(id: string): Thread {
  seed();
  const t = threads.get(id);
  if (!t) throw notFound('Conversation');
  return t;
}

const allThreads = () => {
  seed();
  return [...threads.values()];
};

const lastInboundOf = (t: Thread) => [...t.messages].reverse().find((m) => m.direction === 'in');
const isSnoozed = (t: Thread) => t.snoozedUntil !== null && Date.parse(t.snoozedUntil) > Date.now();
const customerWroteLast = (t: Thread) => t.messages.at(-1)?.direction === 'in';

function conversationOf(t: Thread): Conversation {
  const last = t.messages.at(-1);
  const inbound = lastInboundOf(t);
  const closesAt = inbound ? new Date(Date.parse(inbound.sent_at) + 24 * HOUR) : null;
  const state = customerOf(t);
  return {
    agent_activity: t.activity,
    ai_available: true,
    ai_paused: t.aiPaused,
    assigned_at: t.assignedAt,
    assigned_by: t.assignedBy,
    assignee: t.assignee,
    channel: 'messenger',
    chase_dismiss_reason: t.chaseReason,
    chase_dismissed_at: t.chaseAt,
    created_at: t.createdAt,
    customer_id: t.customer.id,
    customer_name: state.name,
    customer_photo_url: null,
    escalation_reason: t.escalation,
    history_imported_before: null,
    id: conversationIdOf(t.customer.id),
    last_inbound_at: inbound?.sent_at ?? null,
    last_message: last
      ? {
          author: last.author,
          direction: last.direction,
          has_attachments: last.attachments.length > 0,
          template_type: last.template?.type ?? null,
          text: last.text,
        }
      : null,
    last_message_at: last?.sent_at ?? null,
    needs_human: t.needsHuman,
    snooze_note: t.snoozeNote,
    snoozed_until: t.snoozedUntil,
    status: t.status,
    takeover_deadline: t.takeoverDeadline,
    takeover_duration_minutes: t.takeoverMinutes,
    unread_count: t.unread,
    window_closes_at: closesAt?.toISOString() ?? null,
    window_open: closesAt !== null && closesAt.getTime() > Date.now(),
  };
}

function contextOf(t: Thread): Context {
  const state = customerOf(t);
  const inbound = lastInboundOf(t);
  const latest = t.status === 'closed' ? ordersOfCustomer(t.customer.id)[0] : undefined;
  return {
    ai_available: true,
    conversation: conversationOf(t),
    customer: {
      addresses: state.addresses.map((a) => ({
        area: a.area,
        district: a.district,
        id: a.id,
        is_default: a.is_default,
        line: a.line,
        raw_text: a.raw_text,
      })),
      first_seen_channel: 'messenger',
      gender: state.gender,
      id: t.customer.id,
      locale: state.locale,
      name: state.name,
      notes: state.notes,
      phone_e164: state.phone,
    },
    customer_details: t.proposal?.customer ?? null,
    draft: t.draft,
    follow_up: { check_at: null, enabled: false, opted_out_at: null, requested_at: null },
    order_created: latest
      ? {
          currency: latest.currency,
          id: latest.id,
          number: latest.number,
          status: latest.status,
          total_minor: latest.total_minor,
        }
      : null,
    order_discarded: t.discarded,
    order_preparation: t.preparation,
    order_proposal: t.proposal,
    order_proposal_source_at: t.proposal ? (inbound?.sent_at ?? null) : null,
    order_source_at: inbound?.sent_at ?? null,
    origin: {
      source: t.customer.district === 'Dhaka' ? 'Facebook Page post' : 'Facebook ad',
      entry: 'Messenger',
      page: 'Nakshi Ghor',
    },
  };
}

function changed(t: Thread, kind = 'conversation') {
  emitInboxSignal({ kind, conversation_id: conversationIdOf(t.customer.id) });
}

// ---------------------------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------------------------

const flag = (value: string | null): boolean | null =>
  value === 'true' ? true : value === 'false' ? false : null;

const digitsOnly = (s: string) => asciiDigits(s).replace(/\D/g, '');

function matchesSearch(t: Thread, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const state = customerOf(t);
  const digits = digitsOnly(needle);
  if ((state.name ?? '').toLowerCase().includes(needle)) return true;
  if (digits.length >= 3 && digitsOnly(state.phone ?? '').includes(digits)) return true;
  const number = /^#?(\d{1,9})$/.exec(needle)?.[1];
  return (
    number !== undefined && ordersOfCustomer(t.customer.id).some((o) => String(o.number) === number)
  );
}

const oldest = (items: (string | null | undefined)[]) =>
  items.filter((v): v is string => !!v).sort()[0] ?? null;

on('get', '/v1/conversations/counts', () => {
  const open = allThreads().filter((t) => t.status === 'open');
  const live = open.filter((t) => !isSnoozed(t));
  const draftReady = live.filter((t) => t.draft);
  const needsHuman = live.filter((t) => t.needsHuman);
  const needsReply = live.filter(customerWroteLast);
  return {
    closed: allThreads().length - open.length,
    draft_ready: draftReady.length,
    needs_human: needsHuman.length,
    needs_reply: needsReply.length,
    oldest_draft_ready_at: oldest(draftReady.map((t) => t.draft?.created_at)),
    oldest_needs_human_at: oldest(needsHuman.map((t) => lastInboundOf(t)?.sent_at)),
    oldest_needs_reply_at: oldest(needsReply.map((t) => lastInboundOf(t)?.sent_at)),
    open: live.length,
    snoozed: open.filter(isSnoozed).length,
  };
});

on('get', '/v1/conversations', ({ query }) => {
  const status = query.get('status');
  const needsReply = flag(query.get('needs_reply'));
  const needsHuman = flag(query.get('needs_human'));
  const draftReady = flag(query.get('draft_ready'));
  const aiPaused = flag(query.get('ai_paused'));
  const windowClosed = flag(query.get('window_closed'));
  const snoozed = flag(query.get('snoozed'));
  const assignee = query.get('assignee');
  const q = query.get('q') ?? '';

  const items = allThreads().filter((t) => {
    if (status && t.status !== status) return false;
    if (needsReply !== null && (t.status === 'open' && customerWroteLast(t)) !== needsReply) return false;
    if (needsHuman !== null && t.needsHuman !== needsHuman) return false;
    if (draftReady !== null && (t.status === 'open' && !isSnoozed(t) && t.draft !== null) !== draftReady)
      return false;
    if (aiPaused !== null && t.aiPaused !== aiPaused) return false;
    if (windowClosed !== null && !conversationOf(t).window_open !== windowClosed) return false;
    if (snoozed !== null && isSnoozed(t) !== snoozed) return false;
    if (assignee === 'me' && t.assignee?.id !== OWNER.id) return false;
    if (assignee === 'unassigned' && t.assignee !== null) return false;
    if (assignee && assignee !== 'me' && assignee !== 'unassigned' && t.assignee?.id !== assignee)
      return false;
    return matchesSearch(t, q);
  });
  items.sort((a, b) =>
    snoozed === true
      ? Date.parse(a.snoozedUntil ?? '') - Date.parse(b.snoozedUntil ?? '')
      : Date.parse(b.messages.at(-1)?.sent_at ?? '') - Date.parse(a.messages.at(-1)?.sent_at ?? ''),
  );
  const limit = Math.max(1, Number(query.get('limit')) || 50);
  const from = Math.max(0, Number(query.get('cursor')) || 0);
  return {
    items: items.slice(from, from + limit).map(conversationOf),
    next_cursor: from + limit < items.length ? String(from + limit) : null,
  };
});

on('post', '/v1/conversations/bulk', ({ body }) => {
  const updated: string[] = [];
  const missing: string[] = [];
  seed();
  for (const id of body.ids) {
    const t = threads.get(id);
    if (!t) {
      missing.push(id);
      continue;
    }
    if (body.action === 'close') t.status = 'closed';
    t.unread = 0;
    updated.push(id);
  }
  emitInboxSignal({ kind: 'conversation', conversation_id: null });
  return { not_found: missing, updated };
});

on('post', '/v1/conversations/read-all', () => {
  let updated = 0;
  for (const t of allThreads()) {
    if (t.status === 'open' && t.unread > 0) {
      t.unread = 0;
      updated += 1;
    }
  }
  return { updated };
});

on('get', '/v1/conversations/{conversation_id}', ({ params }) =>
  conversationOf(getThread(params.conversation_id ?? '')),
);

on('patch', '/v1/conversations/{conversation_id}', ({ params, body }) => {
  const t = getThread(params.conversation_id ?? '');
  if (body.status) t.status = body.status;
  if (body.needs_human !== undefined && body.needs_human !== null) {
    t.needsHuman = body.needs_human;
    if (!body.needs_human) t.escalation = null;
  }
  if (body.ai_paused !== undefined && body.ai_paused !== null) {
    t.aiPaused = body.ai_paused;
    const minutes = body.ai_paused ? (body.takeover_duration_minutes ?? null) : null;
    t.takeoverMinutes = minutes;
    t.takeoverDeadline = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  }
  changed(t);
  return conversationOf(t);
});

on('get', '/v1/conversations/{conversation_id}/agent-activity', ({ params }) => ({
  agent_activity: getThread(params.conversation_id ?? '').activity,
}));

on('get', '/v1/conversations/{conversation_id}/context', ({ params }) =>
  contextOf(getThread(params.conversation_id ?? '')),
);

on('post', '/v1/conversations/{conversation_id}/read', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  t.unread = 0;
  return conversationOf(t);
});

on('post', '/v1/conversations/{conversation_id}/assign', ({ params, body }) => {
  const t = getThread(params.conversation_id ?? '');
  if (body.user_id === null) {
    t.assignee = null;
    t.assignedAt = null;
    t.assignedBy = null;
  } else {
    const member = [ME, STAFF_ASSIGNEE].find((m) => m.id === body.user_id);
    if (!member) throw new DemoError(422, 'VALIDATION_ERROR', 'That person is not on the team.');
    t.assignee = member;
    t.assignedAt = new Date().toISOString();
    t.assignedBy = ME;
  }
  changed(t);
  return conversationOf(t);
});

on('post', '/v1/conversations/{conversation_id}/snooze', ({ params, body }) => {
  const t = getThread(params.conversation_id ?? '');
  t.snoozedUntil = body.until;
  t.snoozeNote = body.note?.trim() ? body.note.trim() : null;
  changed(t);
  return conversationOf(t);
});

on('delete', '/v1/conversations/{conversation_id}/snooze', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  t.snoozedUntil = null;
  t.snoozeNote = null;
  changed(t);
  return conversationOf(t);
});

on('post', '/v1/conversations/{conversation_id}/chase-dismissal', ({ params, body }) => {
  const t = getThread(params.conversation_id ?? '');
  t.chaseReason = body.reason;
  t.chaseAt = new Date().toISOString();
  changed(t);
  return contextOf(t);
});

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

on('get', '/v1/conversations/{conversation_id}/messages', ({ params, query }) => {
  const t = getThread(params.conversation_id ?? '');
  const newestFirst = [...t.messages].reverse();
  const limit = Math.max(1, Number(query.get('limit')) || 30);
  const from = Math.max(0, Number(query.get('cursor')) || 0);
  return {
    items: newestFirst.slice(from, from + limit),
    next_cursor: from + limit < newestFirst.length ? String(from + limit) : null,
  };
});

on('post', '/v1/conversations/{conversation_id}/messages', ({ params, body }) => {
  const id = params.conversation_id ?? '';
  const t = getThread(id);
  if (!conversationOf(t).window_open) {
    throw new DemoError(
      409,
      'REPLY_WINDOW_CLOSED',
      'The 24-hour Messenger window has closed. Wait for the customer to write again.',
    );
  }
  const draft = body.draft_id ? t.draft : null;
  if (body.draft_id && draft?.id !== body.draft_id) {
    throw new DemoError(409, 'DRAFT_NOT_PENDING', 'This draft was replaced or already decided.');
  }
  const text = body.text?.trim() || draft?.text || null;
  const now = new Date().toISOString();
  const batch: Message[] = [];
  if (text) batch.push(makeMessage(id, 'out', 'merchant', text, now, { from_draft: Boolean(draft) }));
  for (const _attachment of body.attachments ?? []) {
    batch.push(
      makeMessage(id, 'out', 'merchant', null, now, {
        attachments: [{ title: 'Attachment', type: 'file', url: null }],
      }),
    );
  }
  const lang: Lang = detectLang(text ?? '') === 'bn' ? 'bn' : 'en';
  const cardIds =
    body.product_ids ?? draft?.cards.flatMap((c) => (c.product_id ? [c.product_id] : [])) ?? [];
  const cards = cardIds.flatMap((cardId) => {
    const p = PRODUCTS.find((x) => x.id === cardId);
    return p
      ? [{ buttons: [], image_url: null, product_id: p.id, subtitle: taka(priceMinor(p), lang), title: p.name }]
      : [];
  });
  if (cards.length > 0) {
    batch.push(
      makeMessage(id, 'out', 'merchant', null, new Date(Date.now() + 1).toISOString(), {
        template: {
          buttons: [],
          cards,
          currency: null,
          items: [],
          order_id: null,
          order_number: null,
          payment_method: null,
          shipping: null,
          subtotal: null,
          text: null,
          total: null,
          type: 'generic',
        },
      }),
    );
  }
  const first = batch[0];
  if (!first) throw new DemoError(422, 'VALIDATION_ERROR', 'Write a message first.');
  t.messages.push(...batch);
  t.unread = 0;
  t.draft = null;
  t.activity = null;
  changed(t);
  // The customer reads it a few seconds later.
  setTimeout(() => {
    for (const message of batch) message.read_at = new Date().toISOString();
    changed(t);
  }, 6000);
  return { ...first, batch };
});

on('delete', '/v1/conversations/{conversation_id}/messages/{message_id}', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  const index = t.messages.findIndex((m) => m.id === params.message_id);
  if (index < 0) throw notFound('Message');
  t.messages.splice(index, 1);
  changed(t);
  return null;
});

on('post', '/v1/conversations/{conversation_id}/messages/{message_id}/resend', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  const message = t.messages.find((m) => m.id === params.message_id);
  if (!message) throw notFound('Message');
  const now = new Date().toISOString();
  message.send_status = 'sent';
  message.error = null;
  message.delivered_at = now;
  message.sent_at = now;
  t.messages.sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  changed(t);
  return message;
});

// ---------------------------------------------------------------------------------------------
// Drafts, polish, dictation
// ---------------------------------------------------------------------------------------------

on('post', '/v1/conversations/{conversation_id}/drafts', ({ params, body }) => {
  const t = getThread(params.conversation_id ?? '');
  if (!lastInboundOf(t)) throw new DemoError(409, 'NOTHING_TO_DRAFT', 'There is nothing to answer yet.');
  const id = conversationIdOf(t.customer.id);
  const hint = body?.hint?.trim() || null;
  const startedAt = new Date().toISOString();
  let settled = false;
  const phase = (name: Activity['phase']) => {
    if (settled) return;
    t.activity = { phase: name, reason: null, started_at: startedAt, updated_at: new Date().toISOString() };
    emitInboxSignal({ kind: 'agent', conversation_id: id });
  };
  phase('thinking');
  const finish = (seedFor: Seed) => {
    settled = true;
    t.draftCount += 1;
    t.draft = makeDraft(t, seedFor, new Date().toISOString());
    if (seedFor.needsHuman) {
      t.needsHuman = true;
      t.escalation ??= seedFor.handoffReason ?? 'unsure';
    }
    t.activity = null;
    emitInboxSignal({ kind: 'draft', conversation_id: id });
    emitInboxSignal({ kind: 'agent', conversation_id: id });
  };
  const scriptedSeed = () => {
    // The scripted answers cover the customer's last message, in turn; once the merchant has
    // written since, or a note is given, the draft is composed from the thread instead.
    const scripted = HAND[t.index] ?? [];
    const make = customerWroteLast(t) ? scripted[t.draftCount % Math.max(1, scripted.length)] : undefined;
    return hint || !make ? compose(t, hint) : make(t);
  };
  const agentUrl = import.meta.env.VITE_AGENT_URL;
  if (agentUrl) {
    setTimeout(() => phase('searching_products'), 600);
    setTimeout(() => phase('checking_stock'), 1200);
    askAgent(agentUrl, agentRequest(t, hint))
      .then((reply) => finish(seedFromAgent(reply)))
      .catch((error: unknown) => {
        console.warn('The agent did not answer; using the scripted draft.', error);
        finish(scriptedSeed());
      });
    return null;
  }
  setTimeout(() => phase('searching_products'), 600);
  setTimeout(() => phase('checking_stock'), 1200);
  setTimeout(() => finish(scriptedSeed()), 1800);
  return null;
});

on('post', '/v1/conversations/{conversation_id}/drafts/{draft_id}/reject', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  if (t.draft?.id === params.draft_id) t.draft = null;
  changed(t);
  return contextOf(t);
});

/** A light tidy: spacing, capital letters, shorthand and a closing stop. Numbers are untouched. */
function tidy(text: string): string {
  let out = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\s+([,.!?।])/g, '$1')
    .replace(/([,!?])(?=[^\s\d])/g, '$1 ')
    .replace(/\b(plz|pls|plzz)\b/gi, 'please')
    .replace(/\bur\b/gi, 'your')
    .replace(/\bu\b/g, 'you')
    .replace(/\bi\b/g, 'I')
    .replace(/\bthx\b/gi, 'thanks')
    .replace(/\bcod\b/gi, 'COD')
    .replace(/\bbkash\b/gi, 'bKash')
    .replace(/\bnagad\b/gi, 'Nagad')
    .trim();
  out = out.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
  if (out && !/[.!?।:)]$/.test(out)) out += /[ঀ-৿]$/.test(out) ? '।' : '.';
  return out;
}

on('post', '/v1/conversations/{conversation_id}/polish', ({ params, body }) => {
  getThread(params.conversation_id ?? '');
  const text = tidy(body.text);
  return { changed: text !== body.text, outcome: 'ok' as const, text };
});

on('post', '/v1/conversations/{conversation_id}/dictation', () => {
  throw new DemoError(501, 'DEMO_UNAVAILABLE', 'Voice dictation is not available in the demo.');
});

// ---------------------------------------------------------------------------------------------
// Order preparation (the order form's autosaved draft)
// ---------------------------------------------------------------------------------------------

type Write = S['OrderPreparationWrite'];

function store(t: Thread, write: Write, attempt: Preparation['creation_attempt'] = null): Preparation {
  const current = t.preparation;
  if (
    current &&
    current.preparation_id === write.preparation_id &&
    current.version !== write.expected_version
  ) {
    throw new DemoError(409, 'PREPARATION_VERSION_CONFLICT', 'The order form changed elsewhere. Reload it.');
  }
  const next: Preparation = {
    creation_attempt: attempt,
    merchant_fields: write.merchant_fields,
    origin: write.origin,
    preparation_id: write.preparation_id,
    reconciliation: write.reconciliation ?? {},
    source_draft_id: write.source_draft_id ?? null,
    values: write.values,
    version: write.expected_version + 1,
  };
  t.preparation = next;
  t.discarded = false;
  return next;
}

on('put', '/v1/conversations/{conversation_id}/order-preparation', ({ params, body }) =>
  store(getThread(params.conversation_id ?? ''), body),
);

on('post', '/v1/conversations/{conversation_id}/order-preparation/attempt', ({ params, body }) =>
  store(getThread(params.conversation_id ?? ''), body.preparation, {
    idempotency_key: body.idempotency_key,
    request: body.request,
  }),
);

on(
  'post',
  '/v1/conversations/{conversation_id}/order-preparation/attempt/clear',
  ({ params, body }) => {
    const t = getThread(params.conversation_id ?? '');
    const current = t.preparation;
    if (!current || current.preparation_id !== body.preparation_id) throw notFound('Order preparation');
    current.creation_attempt = null;
    current.version = body.expected_version + 1;
    return current;
  },
);

on('post', '/v1/conversations/{conversation_id}/order-preparation/discard', ({ params }) => {
  const t = getThread(params.conversation_id ?? '');
  t.preparation = null;
  t.discarded = true;
  changed(t);
  return null;
});

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

function stateOf(id: string): CustomerState {
  seed();
  const state = customers.get(id);
  if (!state) throw notFound('Customer');
  return state;
}

function customerRead(id: string): S['CustomerRead'] {
  const s = stateOf(id);
  return {
    advance_fixed_minor: s.advanceFixed,
    advance_policy: s.advancePolicy,
    created_at: s.createdAt,
    first_seen_channel: 'messenger',
    gender: s.gender,
    id,
    locale: s.locale,
    name: s.name,
    notes: s.notes,
    phone_e164: s.phone,
    updated_at: s.updatedAt,
  };
}

const customerDetail = (id: string): S['CustomerDetailRead'] => ({
  ...customerRead(id),
  addresses: stateOf(id).addresses.map((a) => ({ ...a })),
  channels: [{ channel: 'messenger', created_at: stateOf(id).createdAt, id: `${id.slice(0, -4)}f001` }],
});

/** `01711000101`, `8801711000101` and `+8801711000101` all become `+8801711000101`. */
function toE164(input: string): string {
  const digits = digitsOnly(input);
  if (digits.startsWith('880')) return `+${digits}`;
  if (digits.startsWith('0')) return `+88${digits}`;
  return `+880${digits}`;
}

on('get', '/v1/customers/by-phone', ({ query }) => {
  seed();
  const wanted = toE164(query.get('phone') ?? '');
  for (const [id, state] of customers) {
    if (state.phone === wanted) return customerRead(id);
  }
  throw notFound('Customer');
});

on('get', '/v1/customers/{customer_id}', ({ params }) => customerDetail(params.customer_id ?? ''));

on('patch', '/v1/customers/{customer_id}', ({ params, body }) => {
  const id = params.customer_id ?? '';
  const s = stateOf(id);
  if (body.name !== undefined) s.name = body.name?.trim() || null;
  if (body.notes !== undefined) s.notes = body.notes?.trim() || null;
  if (body.gender !== undefined) s.gender = body.gender;
  if (body.phone !== undefined) s.phone = body.phone?.trim() ? toE164(body.phone) : null;
  s.updatedAt = new Date().toISOString();
  const thread = threads.get(conversationIdOf(id));
  if (thread) changed(thread);
  return customerDetail(id);
});

on('post', '/v1/customers/{customer_id}/addresses', ({ params, body }) => {
  const s = stateOf(params.customer_id ?? '');
  const now = new Date().toISOString();
  const makeDefault = body.is_default || s.addresses.length === 0;
  if (makeDefault) for (const a of s.addresses) a.is_default = false;
  const address: Address = {
    area: body.area ?? null,
    created_at: now,
    district: body.district ?? null,
    id: nextId('7'),
    is_default: makeDefault,
    line: body.line ?? null,
    raw_text: body.raw_text,
    updated_at: now,
  };
  s.addresses.push(address);
  return address;
});

on('patch', '/v1/customers/{customer_id}/addresses/{address_id}', ({ params, body }) => {
  const s = stateOf(params.customer_id ?? '');
  const address = s.addresses.find((a) => a.id === params.address_id);
  if (!address) throw notFound('Address');
  if (body.area !== undefined) address.area = body.area;
  if (body.district !== undefined) address.district = body.district;
  if (body.line !== undefined) address.line = body.line;
  if (body.raw_text) address.raw_text = body.raw_text;
  if (body.is_default === true) {
    for (const a of s.addresses) a.is_default = false;
    address.is_default = true;
  }
  address.updated_at = new Date().toISOString();
  return { ...address };
});

on('delete', '/v1/customers/{customer_id}/addresses/{address_id}', ({ params }) => {
  const s = stateOf(params.customer_id ?? '');
  const index = s.addresses.findIndex((a) => a.id === params.address_id);
  if (index < 0) throw notFound('Address');
  const [removed] = s.addresses.splice(index, 1);
  const next = s.addresses[0];
  if (removed?.is_default && next) next.is_default = true;
  return null;
});

on('put', '/v1/customers/{customer_id}/advance', ({ params, body }) => {
  const id = params.customer_id ?? '';
  const s = stateOf(id);
  s.advancePolicy = body.policy;
  s.advanceFixed = body.policy === 'fixed' ? (body.fixed_minor ?? null) : null;
  s.updatedAt = new Date().toISOString();
  return customerDetail(id);
});

const COURIERS = ['Pathao', 'Steadfast', 'RedX'];

function deliveryRecord(id: string): S['CustomerDeliveryRecordRead'] {
  stateOf(id);
  const orders = ordersOfCustomer(id);
  const count = (...statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length;
  const index = Math.max(
    0,
    CUSTOMERS.findIndex((c) => c.id === id),
  );
  // What other shops' couriers report for this customer, made up from the cast position.
  const total = 3 + index * 2;
  const returned = index % 4 === 3 ? 3 : index % 3 === 0 ? 1 : 0;
  const byCourier = Object.fromEntries(
    COURIERS.map((name, i) => {
      const share = Math.floor(total / COURIERS.length) + (i < total % COURIERS.length ? 1 : 0);
      const back = i === 0 ? returned : 0;
      return [name, { delivered: Math.max(0, share - back), returned: back, total: share }];
    }),
  );
  return {
    network: {
      by_courier: byCourier,
      delivered: total - returned,
      fetched_at: networkChecks.get(id) ?? minutesAgo(180),
      returned,
      total,
    },
    network_available: true,
    own: {
      cancelled: count('cancelled'),
      delivered: count('delivered'),
      in_progress: count('pending', 'on_hold', 'confirmed', 'processing', 'ready_to_ship', 'shipped'),
      partial: 0,
      returned: count('returned'),
    },
  };
}

on('get', '/v1/customers/{customer_id}/delivery-record', ({ params }) =>
  deliveryRecord(params.customer_id ?? ''),
);

on('post', '/v1/customers/{customer_id}/delivery-record/check', ({ params }) => {
  const id = params.customer_id ?? '';
  stateOf(id);
  networkChecks.set(id, new Date().toISOString());
  return deliveryRecord(id);
});
