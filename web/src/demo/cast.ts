// The demo's fixed cast: one shop, its owner, its customers and its catalog. Every id is fixed so
// the handler files can point at each other's records. Everything is synthetic: phone numbers are
// not real subscribers, emails end in `.test`.

export const SHOP = {
  id: '0197a000-0000-7000-8000-00000000000a',
  name: 'Nakshi Ghor',
  slug: 'nakshi-ghor',
  district: 'Dhaka',
  area: 'Dhanmondi',
  addressLine: 'House 12, Road 5',
  facebookPageName: 'Nakshi Ghor',
  facebookPageId: '100000000000001',
} as const;

export const OWNER = {
  id: '0197a000-0000-7000-8001-00000000000a',
  name: 'Farhana Akter',
  email: 'owner@nakshighor.test',
  phone: '+8801710000001',
} as const;

export const STAFF = {
  id: '0197a000-0000-7000-8001-0000000000a1',
  name: 'Rakib Hasan',
  email: 'rakib@nakshighor.test',
} as const;

export interface CastCustomer {
  id: string;
  name: string;
  phone: string;
  /** Messenger page-scoped id; every demo customer came in through Messenger. */
  psid: string;
  district: string;
  area: string;
  addressLine: string;
}

const customer = (n: number, name: string, phone: string, district: string, area: string, addressLine: string): CastCustomer => ({
  id: `0197a000-0000-7000-8100-${String(n).padStart(12, '0')}`,
  name,
  phone,
  psid: `2500000000000${String(n).padStart(3, '0')}`,
  district,
  area,
  addressLine,
});

export const CUSTOMERS: CastCustomer[] = [
  customer(1, 'Nusrat Jahan', '+8801711000101', 'Dhaka', 'Mirpur', 'House 7, Road 3, Section 10'),
  customer(2, 'Tanvir Ahmed', '+8801811000102', 'Chattogram', 'Agrabad', 'Flat 4B, CDA Avenue'),
  customer(3, 'সুমাইয়া ইসলাম', '+8801911000103', 'Dhaka', 'Uttara', 'Sector 7, Road 12, House 30'),
  customer(4, 'Mahmudul Hasan', '+8801611000104', 'Sylhet', 'Zindabazar', 'Lamabazar Road, House 18'),
  customer(5, 'Raisa Chowdhury', '+8801511000105', 'Dhaka', 'Bashundhara', 'Block C, Road 5, House 221'),
  customer(6, 'আরিফ হোসেন', '+8801311000106', 'Rajshahi', 'Shaheb Bazar', 'Ghoramara, House 45'),
  customer(7, 'Sadia Rahman', '+8801711000107', 'Khulna', 'Sonadanga', 'Road 2, House 9'),
  customer(8, 'Imran Kabir', '+8801811000108', 'Gazipur', 'Tongi', 'Station Road, House 3'),
];

export interface CastVariant {
  id: string;
  sku: string;
  options: Record<string, string>;
  stock: number;
}

export interface CastProduct {
  id: string;
  name: string;
  description: string;
  productType: 'clothing' | 'beauty' | 'jewellery' | 'electronics' | 'food' | 'other';
  /** BDT, integer minor units (poisha): 180000 = ৳1,800. */
  priceMinor: number;
  options: Record<string, string[]>;
  aliases: string[];
  variants: CastVariant[];
}

function combinations(options: Record<string, string[]>): Record<string, string>[] {
  return Object.entries(options).reduce<Record<string, string>[]>(
    (acc, [name, values]) => acc.flatMap((combo) => values.map((value) => ({ ...combo, [name]: value }))),
    [{}],
  );
}

let productNo = 0;
function product(
  name: string,
  description: string,
  productType: CastProduct['productType'],
  priceMinor: number,
  options: Record<string, string[]> = {},
  aliases: string[] = [],
  /** Stock per variant, in combination order; missing entries get 25. */
  stock: number[] = [],
): CastProduct {
  productNo += 1;
  const p = String(productNo).padStart(4, '0');
  const variants = combinations(options).map((combo, i) => ({
    id: `0197a000-0000-7000-8201-${p}${String(i + 1).padStart(8, '0')}`,
    sku: `NG-${p}-${i + 1}`,
    options: combo,
    stock: stock[i] ?? 25,
  }));
  return {
    id: `0197a000-0000-7000-8200-${p.padStart(12, '0')}`,
    name,
    description,
    productType,
    priceMinor,
    options,
    aliases,
    variants,
  };
}

const SIZES = ['M', 'L', 'XL'];

export const PRODUCTS: CastProduct[] = [
  product('Cotton Panjabi', 'সুতি পাঞ্জাবি, ঈদ কালেকশন।', 'clothing', 180000, { Size: SIZES, Colour: ['White', 'Navy'] }, ['panjabi', 'পাঞ্জাবি'], [12, 8, 0, 20, 3, 15]),
  product('জামদানি শাড়ি', 'হাতে বোনা জামদানি, ব্লাউজ পিস সহ।', 'clothing', 650000, { Colour: ['লাল', 'নীল', 'সবুজ'] }, ['jamdani', 'saree'], [4, 2, 6]),
  product('Linen Shirt', 'Slim-fit linen shirt.', 'clothing', 220000, { Size: SIZES, Colour: ['Sky', 'Sand'] }),
  product('থ্রি-পিস (লন)', 'প্রিন্টেড লন থ্রি-পিস।', 'clothing', 280000, { Size: ['M', 'L'] }, ['three piece', '3 piece'], [10, 1]),
  product('Denim Jacket', 'Washed denim jacket, unisex.', 'clothing', 320000, { Size: SIZES }, [], [0, 0, 0]),
  product('Silk Scarf', 'Printed silk scarf.', 'clothing', 85000, { Colour: ['Rose', 'Teal'] }),
  product('সুতি ওড়না', 'হালকা সুতি ওড়না।', 'clothing', 45000, { Colour: ['হলুদ', 'গোলাপি'] }),
  product('Leather Wallet', 'Genuine leather wallet.', 'other', 120000, { Colour: ['Black', 'Brown'] }),
  product('Handbag', 'Everyday tote handbag.', 'other', 195000, { Colour: ['Black', 'Tan'] }, [], [2, 7]),
  product('Kolhapuri Sandals', 'Handmade leather sandals.', 'other', 140000, { Size: ['40', '41', '42'] }),
  product('Rose Face Cream', 'Light daily moisturiser, 50 ml.', 'beauty', 60000),
  product('মেহেদি কোন', 'প্রাকৃতিক মেহেদি, ৩টি কোনের প্যাক।', 'beauty', 15000, {}, ['mehedi', 'mehendi'], [60]),
  product('Gold-plated Earrings', 'Jhumka style, gold plated.', 'jewellery', 95000, { Colour: ['Gold', 'Silver'] }),
  product('Wireless Earbuds', 'Bluetooth 5.3, 20 hour battery.', 'electronics', 250000, { Colour: ['Black', 'White'] }, [], [5, 0]),
  product('আমসত্ত্ব (৫০০ গ্রাম)', 'ঘরে তৈরি আমসত্ত্ব।', 'food', 38000, {}, ['amshotto'], [40]),
];

/** Delivery options the shop offers; fees in minor units. */
export const DELIVERY_OPTIONS = [
  { id: '0197a000-0000-7000-8300-000000000001', name: 'Inside Dhaka', feeMinor: 7000, days: '1-2' },
  { id: '0197a000-0000-7000-8300-000000000002', name: 'Outside Dhaka', feeMinor: 13000, days: '3-5' },
] as const;

/** Minutes before "now" when the demo starts; handlers compute timestamps relative to load. */
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** One Messenger conversation per customer, same order as `CUSTOMERS`. */
export const conversationIdOf = (customerId: string) =>
  `0197a000-0000-7000-8400-${customerId.slice(-12)}`;
