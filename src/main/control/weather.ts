import { log } from "../utils/logger";

interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
}

// 常用中国城市经纬度（离线映射，0延迟）
const CITY_COORDS: Record<string, GeoLocation> = {
  "北京": { name: "北京", latitude: 39.9042, longitude: 116.4074 },
  "上海": { name: "上海", latitude: 31.2304, longitude: 121.4737 },
  "广州": { name: "广州", latitude: 23.1291, longitude: 113.2644 },
  "深圳": { name: "深圳", latitude: 22.5431, longitude: 114.0579 },
  "成都": { name: "成都", latitude: 30.5728, longitude: 104.0668 },
  "杭州": { name: "杭州", latitude: 30.2741, longitude: 120.1551 },
  "武汉": { name: "武汉", latitude: 30.5928, longitude: 114.3055 },
  "西安": { name: "西安", latitude: 34.3416, longitude: 108.9398 },
  "南京": { name: "南京", latitude: 32.0603, longitude: 118.7969 },
  "重庆": { name: "重庆", latitude: 29.4316, longitude: 106.9123 },
  "天津": { name: "天津", latitude: 39.3434, longitude: 117.3616 },
  "苏州": { name: "苏州", latitude: 31.2989, longitude: 120.5853 },
  "长沙": { name: "长沙", latitude: 28.2282, longitude: 112.9388 },
  "郑州": { name: "郑州", latitude: 34.7466, longitude: 113.6253 },
  "青岛": { name: "青岛", latitude: 36.0671, longitude: 120.3826 },
  "沈阳": { name: "沈阳", latitude: 41.8057, longitude: 123.4315 },
  "大连": { name: "大连", latitude: 38.9140, longitude: 121.6147 },
  "哈尔滨": { name: "哈尔滨", latitude: 45.8038, longitude: 126.5350 },
  "济南": { name: "济南", latitude: 36.6512, longitude: 117.1201 },
  "昆明": { name: "昆明", latitude: 24.8801, longitude: 102.8329 },
  "福州": { name: "福州", latitude: 26.0745, longitude: 119.2965 },
  "厦门": { name: "厦门", latitude: 24.4798, longitude: 118.0894 },
  "贵阳": { name: "贵阳", latitude: 26.6470, longitude: 106.6302 },
  "南宁": { name: "南宁", latitude: 22.8170, longitude: 108.3669 },
  "兰州": { name: "兰州", latitude: 36.0611, longitude: 103.8343 },
  "太原": { name: "太原", latitude: 37.8706, longitude: 112.5489 },
  "合肥": { name: "合肥", latitude: 31.8206, longitude: 117.2272 },
  "南昌": { name: "南昌", latitude: 28.6820, longitude: 115.8579 },
  "石家庄": { name: "石家庄", latitude: 38.0428, longitude: 114.5149 },
  "乌鲁木齐": { name: "乌鲁木齐", latitude: 43.8256, longitude: 87.6168 },
  "海口": { name: "海口", latitude: 20.0440, longitude: 110.1990 },
  "三亚": { name: "三亚", latitude: 18.2528, longitude: 109.5119 },
  "拉萨": { name: "拉萨", latitude: 29.6500, longitude: 91.1409 },
  "银川": { name: "银川", latitude: 38.4872, longitude: 106.2309 },
  "西宁": { name: "西宁", latitude: 36.6171, longitude: 101.7782 },
  "呼和浩特": { name: "呼和浩特", latitude: 40.8426, longitude: 111.7511 },
  "香港": { name: "香港", latitude: 22.3193, longitude: 114.1694 },
  "澳门": { name: "澳门", latitude: 22.1987, longitude: 113.5439 },
  "台北": { name: "台北", latitude: 25.0330, longitude: 121.5654 },
  "无锡": { name: "无锡", latitude: 31.4912, longitude: 120.3119 },
  "宁波": { name: "宁波", latitude: 29.8683, longitude: 121.5440 },
  "佛山": { name: "佛山", latitude: 23.0218, longitude: 113.1219 },
  "东莞": { name: "东莞", latitude: 23.0207, longitude: 113.7518 },
  "珠海": { name: "珠海", latitude: 22.2710, longitude: 113.5767 },
  "中山": { name: "中山", latitude: 22.5176, longitude: 113.3927 },
  "惠州": { name: "惠州", latitude: 23.1116, longitude: 114.4161 },
  "汕头": { name: "汕头", latitude: 23.3540, longitude: 116.6818 },
  "湛江": { name: "湛江", latitude: 21.2706, longitude: 110.3594 },
  "桂林": { name: "桂林", latitude: 25.2736, longitude: 110.2907 },
  "丽江": { name: "丽江", latitude: 26.8721, longitude: 100.2299 },
  "黄山": { name: "黄山", latitude: 29.7147, longitude: 118.3375 },
  "九寨沟": { name: "九寨沟", latitude: 33.2602, longitude: 103.9238 },
  "延安": { name: "延安", latitude: 36.5853, longitude: 109.4898 },
  "建平县": { name: "建平县", latitude: 41.4029, longitude: 119.6436 },
};

const WMO_CODE_MAP: Record<number, string> = {
  0: "晴", 1: "晴间多云", 2: "多云", 3: "阴",
  45: "雾", 48: "雾凇",
  51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨",
  56: "冻毛毛雨", 57: "强冻毛毛雨",
  61: "小雨", 63: "中雨", 65: "大雨",
  66: "冻雨", 67: "强冻雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒",
  80: "小阵雨", 81: "阵雨", 82: "强阵雨",
  85: "小阵雪", 86: "强阵雪",
  95: "雷暴", 96: "雷暴伴冰雹", 99: "强雷暴伴冰雹",
};

async function geocodeCity(city: string): Promise<GeoLocation | null> {
  // 1. Try local cache first (0ms)
  if (CITY_COORDS[city]) {
    return CITY_COORDS[city];
  }

  // 2. Try Open-Meteo geocoding API
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { results?: Array<{ name: string; latitude: number; longitude: number }> };
    if (data.results && data.results.length > 0) {
      return { name: data.results[0].name, latitude: data.results[0].latitude, longitude: data.results[0].longitude };
    }
  } catch (error) {
    log(`Geocoding failed for "${city}": ${error instanceof Error ? error.message : String(error)}`);
  }

  return null;
}

export async function weatherForecast(city: string, _days = 3): Promise<string> {
  try {
    const geo = await geocodeCity(city);
    if (!geo) {
      return `找不到城市「${city}」`;
    }

    const params = new URLSearchParams({
      latitude: String(geo.latitude),
      longitude: String(geo.longitude),
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "Asia/Shanghai",
      forecast_days: "3",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };

    const desc = WMO_CODE_MAP[data.current.weather_code] || "未知";
    const today = data.daily;

    let result = `${geo.name}的天气：`;
    result += `当前${desc}，气温${data.current.temperature_2m}度（体感${data.current.apparent_temperature}度）`;
    result += `，湿度${data.current.relative_humidity_2m}%，风速${data.current.wind_speed_10m}km/h`;
    result += `。\n今日${today.temperature_2m_min[0]}度到${today.temperature_2m_max[0]}度，降雨概率${today.precipitation_probability_max[0]}%`;

    if (today.time.length > 1) {
      result += "\n未来预报：";
      for (let i = 1; i < today.time.length; i++) {
        const dDesc = WMO_CODE_MAP[today.weather_code[i]] || "未知";
        result += `\n${today.time[i]}：${dDesc}，${today.temperature_2m_min[i]}度到${today.temperature_2m_max[i]}度，降雨概率${today.precipitation_probability_max[i]}%`;
      }
    }

    return result;
  } catch (error) {
    return `天气查询失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}
