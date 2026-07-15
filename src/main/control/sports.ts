import { log } from "../utils/logger";

const API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

const LEAGUE_MAP: Record<string, { id: string; name: string }> = {
  "英超": { id: "4328", name: "英超" },
  "english premier league": { id: "4328", name: "英超" },
  "premier league": { id: "4328", name: "英超" },
  "西甲": { id: "4335", name: "西甲" },
  "la liga": { id: "4335", name: "西甲" },
  "德甲": { id: "4331", name: "德甲" },
  "bundesliga": { id: "4331", name: "德甲" },
  "意甲": { id: "4332", name: "意甲" },
  "serie a": { id: "4332", name: "意甲" },
  "法甲": { id: "4334", name: "法甲" },
  "ligue 1": { id: "4334", name: "法甲" },
  "欧冠": { id: "4480", name: "欧冠" },
  "champions league": { id: "4480", name: "欧冠" },
  "欧联": { id: "4481", name: "欧联" },
  "europa league": { id: "4481", name: "欧联" },
  "荷甲": { id: "4337", name: "荷甲" },
  "eredivisie": { id: "4337", name: "荷甲" },
  "苏超": { id: "4330", name: "苏超" },
  "scottish premier": { id: "4330", name: "苏超" },
  "比甲": { id: "4338", name: "比甲" },
  "belgian pro league": { id: "4338", name: "比甲" },
  "葡超": { id: "4344", name: "葡超" },
  "primeira liga": { id: "4344", name: "葡超" },
  "土超": { id: "4339", name: "土超" },
  "super lig": { id: "4339", name: "土超" },
  "美职联": { id: "4346", name: "美职联" },
  "mls": { id: "4346", name: "美职联" },
  "巴甲": { id: "4351", name: "巴甲" },
  "brasileirao": { id: "4351", name: "巴甲" },
  "阿甲": { id: "4350", name: "阿甲" },
  "argentine primera": { id: "4350", name: "阿甲" },
  "中超": { id: "4376", name: "中超" },
  "chinese super league": { id: "4376", name: "中超" },
  "日职联": { id: "4400", name: "日职联" },
  "j1 league": { id: "4400", name: "日职联" },
  "韩职联": { id: "4407", name: "韩职联" },
  "k league 1": { id: "4407", name: "韩职联" },
  "澳超": { id: "4398", name: "澳超" },
  "a-league": { id: "4398", name: "澳超" },
  "世界杯": { id: "worldcup", name: "世界杯" },
  "world cup": { id: "worldcup", name: "世界杯" },
  "fifa world cup": { id: "worldcup", name: "世界杯" },
  "欧洲杯": { id: "euro", name: "欧洲杯" },
  "euro": { id: "euro", name: "欧洲杯" },
  "美洲杯": { id: "copa", name: "美洲杯" },
  "copa america": { id: "copa", name: "美洲杯" },
  "亚冠": { id: "4485", name: "亚冠" },
  "afc champions league": { id: "4485", name: "亚冠" },
};

function matchLeague(query: string): { id: string; name: string } | null {
  const lower = query.toLowerCase().trim();

  for (const [key, val] of Object.entries(LEAGUE_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      return val;
    }
  }
  return null;
}

interface SportsEvent {
  strHomeTeam: string;
  strAwayTeam: string;
  dateEvent: string;
  strTime: string;
  strLeague: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
}

export async function sportsSchedule(query: string): Promise<string> {
  try {
    const league = matchLeague(query);

    if (!league) {
      return `未找到「${query}」对应的联赛。支持的联赛包括：英超、西甲、德甲、意甲、法甲、欧冠、欧联、中超、日职联、韩职联、巴甲、阿甲、世界杯、欧洲杯、美洲杯等。`;
    }

    // Special handling for international tournaments (TheSportsDB doesn't have these)
    if (league.id === "worldcup" || league.id === "euro" || league.id === "copa") {
      const { webSearch } = await import("./search");
      const searchResult = await webSearch(`${league.name}赛程 2026`);
      return `${league.name}赛程：\n${searchResult}`;
    }

    const url = `${API_BASE}/eventsnextleague.php?id=${league.id}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { events: SportsEvent[] | null };
    const events = data.events;

    if (!events || events.length === 0) {
      return `暂时没有${league.name}的 upcoming 赛程数据。`;
    }

    let result = `${league.name}近期赛程：\n`;
    const maxShow = Math.min(5, events.length);
    for (let i = 0; i < maxShow; i++) {
      const e = events[i];
      const score = e.intHomeScore !== null
        ? `（${e.intHomeScore}:${e.intAwayScore}）`
        : "";
      result += `${e.dateEvent} ${e.strTime?.slice(0, 5) || ""} ${e.strHomeTeam} vs ${e.strAwayTeam}${score}\n`;
    }

    if (events.length > 5) {
      result += `（共${events.length}场，仅显示前5场）`;
    }

    return result.trim();
  } catch (error) {
    log(`Sports API error: ${error instanceof Error ? error.message : String(error)}`);
    return `体育赛程查询失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}
