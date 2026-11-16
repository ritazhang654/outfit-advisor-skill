import { pgTable, varchar, text, integer, boolean, jsonb, timestamp, date, index, serial } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 衣橱单品表
export const clothingItems = pgTable(
	"clothing_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		image_key: text("image_key").notNull(),
		category: varchar("category", { length: 20 }).notNull(), // top/bottom/outerwear/dress/shoes/accessory
		name: varchar("name", { length: 100 }).notNull(),
		color: varchar("color", { length: 30 }),
		style: varchar("style", { length: 30 }), // casual/business/formal/sport/fashion/street
		formality: integer("formality"), // 1休闲 - 5正式
		season: jsonb("season").$type<string[]>(), // ["spring","summer","autumn","winter"]
		thickness: varchar("thickness", { length: 10 }), // thin/medium/thick
		notes: text("notes"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("clothing_items_category_idx").on(table.category),
		index("clothing_items_created_at_idx").on(table.created_at),
	]
);

// 穿搭记录/推荐表
export const outfitRecords = pgTable(
	"outfit_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		wear_date: date("wear_date", { mode: 'string' }).notNull(), // YYYY-MM-DD
		item_ids: jsonb("item_ids").$type<string[]>().notNull(),
		occasion: varchar("occasion", { length: 20 }).notNull(), // formal/nice/casual
		reason: text("reason"),
		tips: text("tips"),
		weather: jsonb("weather"),
		status: varchar("status", { length: 20 }).notNull().default("recommended"), // recommended/worn
		ai_item_ids: jsonb("ai_item_ids").$type<string[]>(), // AI 最初推荐的单品 id（手工调整前）
		user_adjusted: boolean("user_adjusted").notNull().default(false), // 是否被手工调整过
		adjust_note: text("adjust_note"), // 调整备注
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("outfit_records_wear_date_idx").on(table.wear_date),
		index("outfit_records_status_idx").on(table.status),
	]
);

// 穿搭灵感图集（AI 风格分析）
export const inspirations = pgTable(
	"inspirations",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		image_key: text("image_key").notNull(),
		summary: varchar("summary", { length: 200 }), // 一句话风格总结
		style: varchar("style", { length: 30 }),
		palette: jsonb("palette"), // 配色
		pieces: jsonb("pieces"), // 关键单品
		vibe: text("vibe"), // 风格氛围详述
		notes: text("notes"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("inspirations_created_at_idx").on(table.created_at),
	]
);

// 用户设置（单用户，固定一行）
export const userSettings = pgTable("user_settings", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	city: varchar("city", { length: 50 }),
	weekday_rules: jsonb("weekday_rules").$type<Record<string, string>>(), // {"1":"formal",...}
	updated_at: timestamp("updated_at", { withTimezone: true }),
});

// 化妆品（美妆柜）
export const cosmetics = pgTable(
	"cosmetics",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		image_key: text("image_key"),
		name: varchar("name", { length: 100 }).notNull(),
		brand: varchar("brand", { length: 50 }),
		category: varchar("category", { length: 20 }).notNull(), // skincare/makeup/perfume/other
		subcategory: varchar("subcategory", { length: 20 }), // 细分类别 key
		spec_type: varchar("spec_type", { length: 10 }).notNull().default("full"), // full/mid/sample
		size: varchar("size", { length: 30 }), // 容量如 50ml
		shade: varchar("shade", { length: 50 }), // 色号
		opened_at: date("opened_at", { mode: 'string' }), // 开封日期 YYYY-MM-DD
		shelf_months: integer("shelf_months"), // 开封后保质月数，默认 12
		expiry_date: date("expiry_date", { mode: 'string' }), // 包装印刷的到期日，未开封也适用
		quantity: integer("quantity").notNull().default(1), // 数量，默认 1
		status: varchar("status", { length: 10 }).notNull().default("in_use"), // stock未开封/in_use在用/done已用完
		notes: text("notes"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("cosmetics_category_idx").on(table.category),
		index("cosmetics_created_at_idx").on(table.created_at),
	]
);

// 订阅/会员：price 单位为分；cycle monthly|quarterly|yearly|one_time；status active|cancelled
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 100 }).notNull(),
		vendor: varchar("vendor", { length: 50 }),
		category: varchar("category", { length: 20 }).notNull().default("other"),
		cycle: varchar("cycle", { length: 10 }).notNull().default("monthly"),
		price: integer("price").notNull().default(0), // 每期费用，单位分
		expire_at: date("expire_at", { mode: "string" }),
		auto_renew: boolean("auto_renew").notNull().default(false),
		notes: text("notes"),
		status: varchar("status", { length: 10 }).notNull().default("active"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("subscriptions_expire_idx").on(table.expire_at),
		index("subscriptions_category_idx").on(table.category),
	]
);

// OOTD：我的日常穿搭照片，供 AI 学习个人风格；rating 1-5 越高代表越喜欢
export const ootdRecords = pgTable(
	"ootd_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		image_key: text("image_key").notNull(),
		wear_date: date("wear_date", { mode: "string" }).notNull(),
		occasion: varchar("occasion", { length: 20 }),
		summary: varchar("summary", { length: 200 }),
		style: varchar("style", { length: 30 }),
		palette: jsonb("palette"),
		pieces: jsonb("pieces"),
		rating: integer("rating"), // 1-5
		notes: text("notes"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("ootd_records_wear_date_idx").on(table.wear_date),
		index("ootd_records_created_at_idx").on(table.created_at),
	]
);

// 食品库：quantity <= min_quantity 时提示补货；expire_at 用于临期提醒
export const foods = pgTable(
	"foods",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 100 }).notNull(),
		brand: varchar("brand", { length: 50 }),
		category: varchar("category", { length: 20 }).notNull().default("other"),
		quantity: integer("quantity").notNull().default(1),
		unit: varchar("unit", { length: 10 }).default("件"),
		min_quantity: integer("min_quantity").notNull().default(1),
		expire_at: date("expire_at", { mode: "string" }),
		rating: integer("rating"), // 1-5
		notes: text("notes"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("foods_category_idx").on(table.category),
		index("foods_expire_idx").on(table.expire_at),
	]
);
