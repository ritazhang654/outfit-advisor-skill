import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { z } from 'zod';
import {
  FOOD_CATEGORY_LABELS,
  FOOD_UNITS,
  OCCASION_LABELS,
  type ClothingItem,
  type FoodCategory,
  type Occasion,
  type WeatherInfo,
} from './types';
import { OCCASION_PROMPT, WEEKDAY_NAMES, weekdayOf } from './occasion';

export function createLLMClient(forwardHeaders?: Headers): LLMClient {
  const headers = forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders) : undefined;
  return new LLMClient(new Config(), headers);
}

// LLM 输出可能带 markdown 代码块包裹，提取首尾大括号之间的 JSON
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`LLM 输出中未找到 JSON: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- 衣服图片识别 ----------

const analysisSchema = z.object({
  category: z.enum(['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory']),
  name: z.string().min(1).max(60),
  color: z.string().max(30).nullable().optional(),
  style: z.string().max(30).nullable().optional(),
  formality: z.number().int().min(1).max(5).nullable().optional(),
  season: z.array(z.enum(['spring', 'summer', 'autumn', 'winter'])).nullable().optional(),
  thickness: z.enum(['thin', 'medium', 'thick']).nullable().optional(),
  notes: z.string().max(80).nullable().optional(),
});

export type ClothingAnalysis = z.infer<typeof analysisSchema>;

export async function analyzeClothingImage(imageUrl: string, forwardHeaders?: Headers): Promise<ClothingAnalysis> {
  const client = createLLMClient(forwardHeaders);
  const messages = [
    {
      role: 'system' as const,
      content:
        '你是服装识别专家。识别图片中的服装单品并输出 JSON，不要输出任何其他文字。' +
        'category 取值：top(上装) bottom(裤/裙) outerwear(外套) dress(连衣裙) shoes(鞋) accessory(配饰)。' +
        'style 取值：casual/business/formal/sport/fashion/street。' +
        'formality 为 1-5 整数（1=运动休闲 3=日常通勤 5=商务正式）。' +
        'season 为 ["spring","summer","autumn","winter"] 的子集。' +
        'thickness 取值：thin(薄) medium(适中) thick(厚)。' +
        '输出格式：{"category":"...","name":"...","color":"...","style":"...","formality":3,"season":[...],"thickness":"...","notes":"..."}',
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: '识别这张衣服图片的单品信息，用中文命名（如：白色衬衫、深蓝直筒牛仔裤），返回 JSON。',
        },
        { type: 'image_url' as const, image_url: { url: imageUrl, detail: 'high' as const } },
      ],
    },
  ];

  const response = await client.invoke(messages, { temperature: 0.2 });
  return analysisSchema.parse(extractJson(response.content));
}

// ---------- 穿搭推荐 ----------

const outfitSchema = z.object({
  item_nos: z.array(z.number().int().min(1)).min(1),
  reason: z.string().min(1).max(150),
  tips: z.string().max(80).nullable().optional(),
});

export interface OutfitInput {
  date: string;
  weather: WeatherInfo;
  occasion: Occasion;
  items: ClothingItem[];
  recentWorn: Array<{ date: string; item_ids: string[] }>;
  excludedSets: string[][];
  inspirations: string[]; // 用户收藏的灵感穿搭描述
  adjustNotes: string[]; // 近期用户手工调整记录描述（AI 原方案 → 用户改法）
  myOotds: string[]; // 我自己拍过的 OOTD 描述（越喜欢越靠前）
}

export interface OutfitResult {
  item_ids: string[];
  reason: string;
  tips: string | null;
}

export async function generateOutfit(input: OutfitInput): Promise<OutfitResult> {
  const client = createLLMClient();

  // 给单品编号，LLM 返回编号，避免复制长 UUID 出错
  const itemsDesc = input.items.map((item, idx) => ({
    no: idx + 1,
    name: item.name,
    category: item.category,
    color: item.color ?? '',
    style: item.style ?? '',
    formality: item.formality ?? 3,
    season: (item.season ?? []).join('/'),
    thickness: item.thickness ?? '',
  }));
  const noToId = new Map(input.items.map((item, idx) => [idx + 1, item.id]));

  const recentDesc =
    input.recentWorn.length > 0
      ? input.recentWorn
          .map((r) => {
            const names = r.item_ids
              .map((id) => input.items.find((i) => i.id === id)?.name)
              .filter(Boolean)
              .join('、');
            return `${r.date}: ${names || '（单品已删除）'}`;
          })
          .join('\n')
      : '无';

  const excludedDesc =
    input.excludedSets.length > 0
      ? input.excludedSets
          .map((set, i) => {
            const names = set
              .map((id) => input.items.find((it) => it.id === id)?.name)
              .filter(Boolean)
              .join('、');
            return `组合${i + 1}: ${names || '未知'}`;
          })
          .join('；')
      : '无';

  const ootdDesc =
    input.myOotds.length > 0
      ? input.myOotds.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : '无';

  const weekday = WEEKDAY_NAMES[weekdayOf(input.date)];
  const rainTip =
    (input.weather.precipitation_prob ?? 0) >= 50 ? '当天降水概率较高，避免浅色鞋子、选好打理的外套。' : '';

  const userPrompt = `请为${input.date}（${weekday}）选出一套穿搭。

明日天气：${input.weather.desc}，气温 ${input.weather.temp_min}~${input.weather.temp_max}°C，降水概率 ${input.weather.precipitation_prob ?? '未知'}%。${rainTip}
场合要求：${OCCASION_PROMPT[input.occasion]}

近期已穿搭配（避免连续两天穿相同组合，鼓励轮换）：
${recentDesc}

本次必须避开、不能重复的组合：${excludedDesc}

我的日常穿搭（我自己拍过的 OOTD，越喜欢越靠前，请贴近这些风格与配色习惯）：
${ootdDesc}

我的衣橱单品（no 为编号）：
${JSON.stringify(itemsDesc)}

规则：
1. 搭配完整：上装+下装，或连衣裙；外套最多 1 件，鞋最多 1 双，包和配饰各最多 1 件（总计 2-6 件）
2. 温度适配：低温(<15°C)必须有外套/厚单品，高温(>28°C)选透气薄款
3. 场合匹配：按上面的场合要求选正式度合适的组合
4. 颜色风格协调，优先利用现有单品
5. item_nos 填单品编号，必须与上次不同
6. 风格贴近：优先参考「我的日常穿搭」体现的配色与搭配习惯，但只能从衣橱单品里选

只输出 JSON：{"item_nos":[编号],"reason":"80字内推荐理由，说明为什么适合明天","tips":"40字内穿着小贴士，可为空"}`;

  const messages = [
    { role: 'system' as const, content: '你是专业穿搭师。只输出一个 JSON 对象，不要输出其他任何文字。' },
    { role: 'user' as const, content: userPrompt },
  ];

  const response = await client.invoke(messages, { temperature: 0.7 });
  const parsed = outfitSchema.parse(extractJson(response.content));

  // 编号 → id，剔除无效编号
  const ids = Array.from(
    new Set(
      parsed.item_nos
        .map((no) => noToId.get(no))
        .filter((id): id is string => Boolean(id))
    )
  );
  if (ids.length === 0) throw new Error('推荐结果中没有有效单品');
  return { item_ids: ids, reason: parsed.reason, tips: parsed.tips ?? null };
}

// ---- 灵感穿搭图片分析 ----

const INSPIRATION_STYLES = ['casual', 'business', 'formal', 'fashion', 'street', 'sport'] as const;

const inspirationSchema = z.object({
  summary: z.string().min(1).max(100),
  style: z.enum(INSPIRATION_STYLES),
  palette: z.array(z.string().max(12)).max(5),
  pieces: z.array(z.string().max(30)).max(6),
  vibe: z.string().max(150).nullable(),
});

export interface InspirationAnalysis {
  summary: string;
  style: string;
  palette: string[];
  pieces: string[];
  vibe: string | null;
}

/** 分析用户收藏的灵感穿搭图，提炼风格特征供推荐参考 */
export async function analyzeInspirationImage(
  imageUrl: string,
  forwardHeaders?: Headers
): Promise<InspirationAnalysis> {
  const client = createLLMClient(forwardHeaders);
  const system = {
    role: 'system' as const,
    content: `你是时尚买手。分析这张搭配/衣着图片，只输出一个 JSON 对象，字段：
{"summary":"一句话概括这套搭配的风格与亮点(30字内)","style":"casual|business|formal|fashion|street|sport 之一","palette":["主色调,中文,最多3个"],"pieces":["关键单品描述,中文,最多4个,每个12字内"],"vibe":"适合的场景与氛围感受(50字内,可为null)"}`,
  };
  const user = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: '分析这套穿搭。' },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.invoke([system, user], { temperature: 0.4 });
      const parsed = inspirationSchema.parse(extractJson(response.content));
      return {
        summary: parsed.summary,
        style: parsed.style,
        palette: parsed.palette,
        pieces: parsed.pieces,
        vibe: parsed.vibe ?? null,
      };
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}

// ---- 我的 OOTD（日常穿搭）图片分析 ----
export interface OotdAnalysis {
  summary: string;
  style: string;
  palette: string[];
  pieces: string[];
  occasion: Occasion | null;
}

const OOTD_OCCASIONS = ['formal', 'nice', 'casual'];

function asText(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (typeof value === 'number') return String(value).slice(0, max);
  return '';
}

function asTextList(value: unknown, max: number, eachMax: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asText(v, eachMax))
    .filter(Boolean)
    .slice(0, max);
}

/** 分析用户上传的 OOTD 照片，提炼个人搭配习惯供推荐参考 */
export async function analyzeOotdImage(
  imageUrl: string,
  forwardHeaders?: Headers
): Promise<OotdAnalysis> {
  const client = createLLMClient(forwardHeaders);
  const system = {
    role: 'system' as const,
    content: `你是时尚买手。分析这张用户本人的穿搭照，提炼他/她真实的穿衣习惯。只输出一个 JSON 对象，字段：
{"summary":"一句话概括这套搭配的构成与亮点(40字内)","style":"casual|business|formal|fashion|street|sport 之一","palette":["主色调,中文,最多3个"],"pieces":["关键单品,中文,最多4个,每个12字内"],"occasion":"formal|nice|casual 中最贴近的场合,判断不出为null"}`,
  };
  const user = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: '分析我今天的这套穿搭。' },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.invoke([system, user], { temperature: 0.4 });
      // 模型偶尔会给出枚举外的措辞或非字符串字段，这里逐字段宽松规整，避免整条分析被丢弃
      const raw = extractJson(response.content) as Record<string, unknown>;
      const summary = asText(raw.summary, 100);
      if (!summary) throw new Error(`分析结果缺少 summary: ${JSON.stringify(raw).slice(0, 200)}`);

      const styleRaw = asText(raw.style, 20);
      const styleKey = styleRaw.toLowerCase();
      const occRaw = asText(raw.occasion, 20).toLowerCase();

      return {
        summary,
        style: (INSPIRATION_STYLES as readonly string[]).includes(styleKey) ? styleKey : styleRaw,
        palette: asTextList(raw.palette, 5, 12),
        pieces: asTextList(raw.pieces, 6, 30),
        // 只有能对上正式/好看/休闲三档时才落库，避免污染日历的场合标签
        occasion: OOTD_OCCASIONS.includes(occRaw) ? (occRaw as Occasion) : null,
      };
    } catch (error) {
      console.error(`OOTD 分析第 ${attempt + 1} 次失败:`, error instanceof Error ? error.message : error);
      if (attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}

// ===== 手工调整后重新生成搭配说明（只针对新组合写文案） =====
const outfitCopySchema = z.object({
  reason: z.string().min(1).max(150),
  tips: z.string().max(120).nullable(),
});

export interface OutfitCopyInput {
  itemLines: string[]; // 每件一行，如 "外套：米色风衣"
  occasion: Occasion;
  weather: WeatherInfo | null;
  adjustNote: string;
}

export async function regenerateOutfitCopy(
  input: OutfitCopyInput,
  forwardHeaders?: Headers
): Promise<{ reason: string; tips: string | null }> {
  const client = createLLMClient(forwardHeaders);
  const weatherText = input.weather
    ? `${input.weather.desc}，${Math.round(input.weather.temp_min)}~${Math.round(input.weather.temp_max)}°C${
        input.weather.precipitation_prob != null ? `，降水概率${input.weather.precipitation_prob}%` : ''
      }`
    : '未知';
  const system = {
    role: 'system' as const,
    content: `你是穿搭顾问。用户把 AI 原本的推荐搭配手工改成了新组合，请只为新组合重新写搭配说明。
硬性要求：
1. reason（40字内）：说明这套为什么适合今天的场合与天气。只允许提到新组合里实际有的单品，组合里没有的单品（如裤子、鞋）绝对不能出现在文案里。
2. tips（50字内，可为null）：针对新组合的实用提示（保暖、配色亮点、打理方式等），同样只针对新组合。
3. 场合：${OCCASION_LABELS[input.occasion]}；当天天气：${weatherText}。
4. 用户写了调整原因时要尊重她的选择，可以体现她的思路。
只输出一个 JSON 对象：{"reason":"...","tips":"..." 或 null}`,
  };
  const user = {
    role: 'user' as const,
    content: `新组合：\n${input.itemLines.join('\n')}${input.adjustNote ? `\n我的调整原因：${input.adjustNote}` : ''}`,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.invoke([system, user], { temperature: 0.5 });
      const parsed = outfitCopySchema.parse(extractJson(response.content));
      return { reason: parsed.reason, tips: parsed.tips ?? null };
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}

// ===== 化妆品包装识别 =====
const COSMETIC_CATEGORIES = ['skincare', 'makeup', 'perfume', 'other'] as const;
const COSMETIC_SPECS = ['full', 'mid', 'sample'] as const;

const cosmeticSchema = z.object({
  name: z.string().min(1).max(80),
  brand: z.string().max(40).nullable(),
  category: z.enum(COSMETIC_CATEGORIES),
  subcategory: z.string().max(20).nullable(),
  spec_type: z.enum(COSMETIC_SPECS),
  size: z.string().max(20).nullable(),
  shade: z.string().max(30).nullable(),
  quantity: z.number().int().min(1).max(99).nullable(),
});

export interface CosmeticAnalysis {
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  spec_type: string;
  size: string | null;
  shade: string | null;
  quantity: number | null;
}

export async function analyzeCosmeticImage(
  imageUrl: string,
  forwardHeaders?: Headers
): Promise<CosmeticAnalysis> {
  const client = createLLMClient(forwardHeaders);
  const system = {
    role: 'system' as const,
    content: `你是美妆顾问。识别图中化妆品的包装信息，只输出一个 JSON 对象，字段：
{"name":"产品名称(以包装上的为准,60字内)","brand":"品牌名,中文或英文,识别不出为null","category":"skincare(护肤)|makeup(彩妆)|perfume(香水)|other(其他) 之一","subcategory":"细分类别,从这些里选最接近的:卸妆/洗面奶/化妆水/精华液/乳液/面霜/眼霜/面膜/防晒/口红/粉底液/隔离霜/散粉/遮瑕/眼影/腮红/眉笔/眼线/睫毛膏/香水/护手霜/身体乳/其他","spec_type":"full(正装)|mid(中样)|sample(小样) 之一,按容量和包装大小判断,小样和旅行装通常是sample","size":"容量或净含量,如50ml、3.5g,没有为null","shade":"色号,如#999、N01、豆沙色,没有为null","quantity":"图里同款商品有几件,能数出来就填数字(1-99),只有1件或数不清为1或null"}
注意：包装上看不到的信息填 null，不要编造。`,
  };
  const user = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: '识别这个化妆品。' },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.invoke([system, user], { temperature: 0.2 });
      const parsed = cosmeticSchema.parse(extractJson(response.content));
      return {
        name: parsed.name,
        brand: parsed.brand ?? null,
        category: parsed.category,
        subcategory: parsed.subcategory ?? null,
        spec_type: parsed.spec_type,
        size: parsed.size ?? null,
        shade: parsed.shade ?? null,
        quantity: parsed.quantity ?? null,
      };
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}

// ---- 食品包装拍照识别 ----
export interface FoodAnalysis {
  name: string;
  brand: string | null;
  category: FoodCategory;
  quantity: number;
  unit: string;
  expire_at: string | null;
  notes: string | null;
}

const FOOD_CATEGORY_KEYS = Object.keys(FOOD_CATEGORY_LABELS) as FoodCategory[];

// 模型可能返回中文类别名或近义词，统一映射回 key
const FOOD_CATEGORY_ALIAS: Record<string, FoodCategory> = {
  ...(Object.fromEntries(
    Object.entries(FOOD_CATEGORY_LABELS).map(([key, label]) => [label, key as FoodCategory])
  ) as Record<string, FoodCategory>),
  牛奶: 'dairy',
  酸奶: 'dairy',
  奶酪: 'dairy',
  水果: 'produce',
  蔬菜: 'produce',
  生鲜: 'produce',
  调味品: 'seasoning',
  调料: 'seasoning',
  方便面: 'staple',
  泡面: 'staple',
  米面: 'staple',
  咖啡: 'drink',
  茶: 'drink',
};

/** 模型可能返回 "dairy乳制品" 这类粘连写法或近义词，这里做宽松归类 */
function normalizeFoodCategory(raw: string): FoodCategory {
  const text = raw.trim();
  if (!text) return 'other';
  const lower = text.toLowerCase();
  if ((FOOD_CATEGORY_KEYS as string[]).includes(lower)) return lower as FoodCategory;
  if (FOOD_CATEGORY_ALIAS[text]) return FOOD_CATEGORY_ALIAS[text];
  for (const key of FOOD_CATEGORY_KEYS) {
    if (lower.includes(key)) return key;
  }
  for (const [alias, key] of Object.entries(FOOD_CATEGORY_ALIAS)) {
    if (text.includes(alias)) return key;
  }
  return 'other';
}

/** 把 2026.12.31 / 2026年12月31日 / 2026-12-31 统一成 YYYY-MM-DD，识别不出返回 null */
function normalizeFoodDate(value: unknown): string | null {
  const text = asText(value, 30);
  if (!text) return null;
  const m = text.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return null;
  const year = m[1];
  const month = m[2].padStart(2, '0');
  const day = m[3].padStart(2, '0');
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** 识别食品包装/实物照片，提取名称、品牌、类别、数量、有效期，用于表单预填 */
export async function analyzeFoodImage(
  imageUrl: string,
  forwardHeaders?: Headers
): Promise<FoodAnalysis> {
  const client = createLLMClient(forwardHeaders);
  const system = {
    role: 'system' as const,
    content: `你是食品收纳助手。识别这张食品包装或实物的照片，只输出一个 JSON 对象，字段：
{"name":"商品名称,中文,去掉促销词和规格描述(30字内)","brand":"品牌名,识别不出为null","category":"只填一个英文单词：dairy(乳制品:牛奶/酸奶/奶酪/黄油)或snack(零食:薯片/饼干/坚果)或staple(主食:米面/速食/面包)或drink(饮料:果汁/咖啡/茶/汽水)或produce(果蔬)或frozen(冷冻食品)或seasoning(调味品)或other","quantity":这件商品的数量,整数,默认1,"unit":"只填一个：件/袋/盒/瓶/罐/桶/包/斤/个","expire_at":"包装上直接印的到期日或保质期至,格式YYYY-MM-DD,只印了生产日期或保质期月数就填null","notes":"储存条件和关键信息,如需冷藏/保质期12个月(30字内),可为null"}
只输出 JSON，不要其他文字。`,
  };
  const user = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: '识别这个食品的信息。' },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.invoke([system, user], { temperature: 0.3 });
      const raw = extractJson(response.content) as Record<string, unknown>;

      const name = asText(raw.name, 100);
      if (!name) throw new Error(`识别结果缺少名称: ${JSON.stringify(raw).slice(0, 200)}`);

      const category = normalizeFoodCategory(asText(raw.category, 20));

      const qtyRaw = Number(raw.quantity);
      const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 && qtyRaw <= 9999 ? Math.floor(qtyRaw) : 1;

      const unitRaw = asText(raw.unit, 10);
      const unit = FOOD_UNITS.includes(unitRaw) ? unitRaw : '件';

      const brand = asText(raw.brand, 50) || null;
      const notes = asText(raw.notes, 200) || null;

      return {
        name,
        brand: brand && brand !== 'null' ? brand : null,
        category,
        quantity,
        unit,
        expire_at: normalizeFoodDate(raw.expire_at),
        notes,
      };
    } catch (error) {
      console.error(`食品识别第 ${attempt + 1} 次失败:`, error instanceof Error ? error.message : error);
      if (attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}
