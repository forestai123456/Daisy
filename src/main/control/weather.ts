import { log } from "../utils/logger";

interface WttrCondition {
  temp_C: string;
  FeelsLikeC: string;
  humidity: string;
  weatherDesc: Array<{ value: string }>;
  windspeedKmph: string;
  cloudcover: string;
}

interface WttrDay {
  date: string;
  maxtempC: string;
  mintempC: string;
  astronomy: Array<{ sunrise: string; sunset: string }>;
  hourly: Array<{
    time: string;
    tempC: string;
    weatherDesc: Array<{ value: string }>;
    chanceofrain: string;
  }>;
}

interface WttrResponse {
  current_condition: WttrCondition[];
  weather: WttrDay[];
}

export async function weatherForecast(city: string, _days = 3): Promise<string> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    log(`weatherForecast: requesting ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as WttrResponse;

    if (!data.current_condition || data.current_condition.length === 0) {
      return `找不到城市「${city}」的天气数据`;
    }

    const cur = data.current_condition[0];
    const today = data.weather[0];
    const desc = cur.weatherDesc[0]?.value || "未知";

    let result = `${city}的天气：`;
    result += `当前${desc}，气温${cur.temp_C}度（体感${cur.FeelsLikeC}度）`;
    result += `，湿度${cur.humidity}%，风速${cur.windspeedKmph}km/h`;
    result += `。\n今日${today.mintempC}度到${today.maxtempC}度`;

    if (today.hourly && today.hourly.length > 0) {
      // Pick 4 representative time points: morning, noon, evening, night
      const picks = [8, 12, 18, 22];
      const selected = picks
        .map((h) => today.hourly.find((x) => parseInt(x.time, 10) / 100 === h))
        .filter(Boolean) as WttrDay["hourly"];

      if (selected.length > 0) {
        result += "。\n分时段：";
        for (const h of selected) {
          result += `\n${h.time} ${h.tempC}°C ${h.weatherDesc[0]?.value || ""} 降水${h.chanceofrain}%`;
        }
      }
    }

    // Add next day forecast
    if (data.weather.length > 1) {
      const tomorrow = data.weather[1];
      result += `\n明天（${tomorrow.date}）：${tomorrow.mintempC}度到${tomorrow.maxtempC}度`;
    }
    if (data.weather.length > 2) {
      const day3 = data.weather[2];
      result += `\n后天（${day3.date}）：${day3.mintempC}度到${day3.maxtempC}度`;
    }

    log(`weatherForecast: success for "${city}"`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`weatherForecast failed for "${city}": ${message}`);
    return `天气查询失败: ${message}`;
  }
}
