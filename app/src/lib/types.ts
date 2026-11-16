// 共享类型定义

export type Category = 'top' | 'bottom' | 'outerwear' | 'dress' | 'shoes' | 'accessory';
export type Occasion = 'formal' | 'nice' | 'casual';

export interface ClothingItem {
  id: string;
  image_key: string;
  category: Category;
  name: string;
  color: string | null;
  style: string | null;
  formality: number | null;
  season: string[] | null;
  thickness: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClothingItemWithUrl extends ClothingItem {
  image_url: string;
}

export interface WeatherInfo {
  date: string;
  desc: string;
  temp_min: number;
  temp_max: number;
  precipitation_prob: number | null;
  wind_max: number | null;
}

export interface OutfitRecord {
  id: string;
  wear_date: string;
  item_ids: string[];
  occasion: Occasion;
  reason: string | null;
  tips: string | null;
  weather: WeatherInfo | null;
  status: 'recommended' | 'worn';
  ai_item_ids: string[] | null;
  user_adjusted: boolean;
  adjust_note: string | null;
  created_at: string;
}

export interface OutfitRecordWithItems extends OutfitRecord {
  items: ClothingItemWithUrl[];
}

export interface Inspiration {
  id: string;
  image_key: string;
  summary: string | null;
  style: string | null;
  palette: string[] | null;
  pieces: string[] | null;
  vibe: string | null;
  notes: string | null;
  created_at: string;
}

export interface InspirationWithUrl extends Inspiration {
  image_url: string;
}

export interface UserSettings {
  city: string | null;
  weekday_rules: Record<string, string>;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  top: '上衣',
  bottom: '裤/裙',
  outerwear: '外套',
  dress: '连衣裙',
  shoes: '鞋子',
  accessory: '配饰',
};

export const CATEGORY_ORDER: Category[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];

export const OCCASION_LABELS: Record<Occasion, string> = {
  formal: '正式',
  nice: '好看',
  casual: '休闲',
};

// ===== 化妆品（美妆柜） =====
export type CosmeticCategory = 'skincare' | 'makeup' | 'perfume' | 'other';
export type CosmeticSpec = 'full' | 'mid' | 'sample';
export type CosmeticStatus = 'stock' | 'in_use' | 'done';

export interface Cosmetic {
  id: string;
  image_key: string | null;
  name: string;
  brand: string | null;
  category: CosmeticCategory;
  subcategory: string | null;
  spec_type: CosmeticSpec;
  size: string | null;
  shade: string | null;
  opened_at: string | null;
  shelf_months: number | null;
  expiry_date: string | null;
  quantity: number;
  status: CosmeticStatus;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CosmeticWithUrl extends Cosmetic {
  image_url: string;
}

export const COSMETIC_CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  skincare: '护肤',
  makeup: '彩妆',
  perfume: '香水',
  other: '其他',
};

export const COSMETIC_CATEGORY_ORDER: CosmeticCategory[] = ['skincare', 'makeup', 'perfume', 'other'];

export const COSMETIC_SUBCATEGORIES: Record<CosmeticCategory, { key: string; label: string }[]> = {
  skincare: [
    { key: 'makeup_remover', label: '卸妆' },
    { key: 'face_wash', label: '洗面奶' },
    { key: 'toner', label: '化妆水' },
    { key: 'serum', label: '精华液' },
    { key: 'lotion', label: '乳液' },
    { key: 'cream', label: '面霜' },
    { key: 'eye_cream', label: '眼霜' },
    { key: 'mask', label: '面膜' },
    { key: 'sunscreen', label: '防晒' },
    { key: 'other', label: '其他' },
  ],
  makeup: [
    { key: 'lipstick', label: '口红' },
    { key: 'foundation', label: '粉底液' },
    { key: 'primer', label: '隔离霜' },
    { key: 'loose_powder', label: '散粉' },
    { key: 'concealer', label: '遮瑕' },
    { key: 'eyeshadow', label: '眼影' },
    { key: 'blush', label: '腮红' },
    { key: 'eyebrow', label: '眉笔' },
    { key: 'eyeliner', label: '眼线' },
    { key: 'mascara', label: '睫毛膏' },
    { key: 'other', label: '其他' },
  ],
  perfume: [{ key: 'perfume', label: '香水' }],
  other: [
    { key: 'hand_cream', label: '护手霜' },
    { key: 'body_lotion', label: '身体乳' },
    { key: 'other', label: '其他' },
  ],
};

export const COSMETIC_SPEC_LABELS: Record<CosmeticSpec, string> = { full: '正装', mid: '中样', sample: '小样' };
export const COSMETIC_STATUS_LABELS: Record<CosmeticStatus, string> = { stock: '未开封', in_use: '在用', done: '已用完' };

// ===== 订阅/会员 =====
export type SubCategory = 'office' | 'video' | 'music' | 'cloud' | 'ai' | 'supermarket' | 'insurance' | 'other';
export type SubCycle = 'monthly' | 'quarterly' | 'yearly' | 'one_time';
export type SubStatus = 'active' | 'cancelled';

export const SUB_CATEGORY_LABELS: Record<SubCategory, string> = {
  office: '办公',
  video: '视频',
  music: '音乐',
  cloud: '云存储',
  ai: 'AI 工具',
  supermarket: '超市',
  insurance: '保险',
  other: '其他',
};
export const SUB_CATEGORY_ORDER: SubCategory[] = [
  'office',
  'video',
  'music',
  'cloud',
  'ai',
  'supermarket',
  'insurance',
  'other',
];

export const SUB_CYCLE_LABELS: Record<SubCycle, string> = {
  monthly: '包月',
  quarterly: '包季',
  yearly: '包年',
  one_time: '买断',
};
// 每类一年要花的期数（买断不计入年化）
export const SUB_CYCLE_PER_YEAR: Record<SubCycle, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  one_time: 0,
};
// 一次续费顺延的月数（买断不续费）
export const SUB_CYCLE_RENEW_MONTHS: Record<SubCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
  one_time: 0,
};

export interface Subscription {
  id: string;
  name: string;
  vendor: string | null;
  category: SubCategory;
  cycle: SubCycle;
  price: number; // 单位：分
  expire_at: string | null;
  auto_renew: boolean;
  notes: string | null;
  status: SubStatus;
  created_at: string;
  updated_at: string | null;
}

// ===== OOTD（我的日常穿搭） =====
export interface OotdRecord {
  id: string;
  image_key: string;
  wear_date: string; // YYYY-MM-DD
  occasion: Occasion | null;
  summary: string | null;
  style: string | null;
  palette: string[] | null;
  pieces: string[] | null;
  rating: number | null; // 1-5，喜欢的程度，推荐时权重更高
  notes: string | null;
  created_at: string;
}

export interface OotdWithUrl extends OotdRecord {
  image_url: string;
}

// ===== 食品库 =====
export type FoodCategory =
  | 'dairy'
  | 'snack'
  | 'staple'
  | 'drink'
  | 'produce'
  | 'frozen'
  | 'seasoning'
  | 'other';

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  category: FoodCategory;
  quantity: number;
  unit: string | null;
  min_quantity: number; // 库存提醒阈值，数量 <= 该值时提醒
  expire_at: string | null;
  rating: number | null; // 1-5 打分
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  dairy: '乳制品',
  snack: '零食',
  staple: '主食',
  drink: '饮料',
  produce: '果蔬',
  frozen: '冷冻',
  seasoning: '调味',
  other: '其他',
};

export const FOOD_CATEGORY_ORDER: FoodCategory[] = [
  'dairy',
  'snack',
  'staple',
  'drink',
  'produce',
  'frozen',
  'seasoning',
  'other',
];

export const FOOD_UNITS = ['件', '袋', '盒', '瓶', '罐', '桶', '包', '斤', '个'];
