import type { WeatherInfo } from './types';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather code → 中文描述
const WMO_CODES: Record<number, string> = {
  0: '晴', 1: '基本晴', 2: '多云', 3: '阴',
  45: '有雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '密集毛毛雨',
  56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨',
  85: '阵雪', 86: '阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴冰雹',
};

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
}

// 城市名 → 经纬度；找不到返回 null
export async function geocodeCity(city: string): Promise<GeoResult | null> {
  const url = `${GEO_URL}?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`地理编码请求失败: ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number }> };
  const hit = data.results?.[0];
  if (!hit) return null;
  return { name: hit.name, latitude: hit.latitude, longitude: hit.longitude };
}

// 查询某城市在指定日期（YYYY-MM-DD）的天气；日期超出预报范围返回 null
export async function getWeatherByDate(city: string, date: string): Promise<WeatherInfo | null> {
  const geo = await geocodeCity(city);
  if (!geo) throw new Error(`找不到城市「${city}」，请检查设置`);

  const url =
    `${FORECAST_URL}?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=16`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`天气请求失败: ${res.status}`);
  const data = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      weather_code: number[];
      wind_speed_10m_max: (number | null)[];
    };
  };

  const daily = data.daily;
  if (!daily) throw new Error('天气数据格式异常');

  const idx = daily.time.indexOf(date);
  if (idx === -1) return null;

  return {
    date,
    desc: WMO_CODES[daily.weather_code[idx]] ?? '未知',
    temp_min: Math.round(daily.temperature_2m_min[idx]),
    temp_max: Math.round(daily.temperature_2m_max[idx]),
    precipitation_prob: daily.precipitation_probability_max[idx],
    wind_max: daily.wind_speed_10m_max[idx],
  };
}
