export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: {
    type: string;
  };
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameter>;
  required: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
}

export const availableTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "使用 DuckDuckGo 搜索引擎联网查询最新信息",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词，用中文或英文都可以",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_wallpapers",
      description: "使用 Wallhaven 高清壁纸库搜索并获取高分辨率电脑壁纸的直连下载链接 (支持SpaceX、动漫、极简等各种题材，不带参数即可搜索最新壁纸)",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "壁纸搜索词。如果用户想要真实的自然风光或摄影，请务必包含 'nature' 或 'photography' 等关键词（例如：'beach nature photography'）以过滤游戏CG（如GTA6）或动漫图。",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_application",
      description: "打开指定的 macOS 应用程序",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: '应用名称，例如 "Safari", "WeChat"。如果是打开默认浏览器或用户只说"打开浏览器"，请务必传入 "browser"。',
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quit_application",
      description: "关闭指定的 macOS 应用程序",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: '应用名称，例如 "Safari", "WeChat", "OpenCode"',
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quit_all_applications",
      description: "关闭/退出所有正在运行的桌面应用程序。默认会自动排除 Finder、Terminal、iTerm、iTerm2 和 Daisy（本程序），绝对不会意外关闭终端或桌面系统。",
      parameters: {
        type: "object",
        properties: {
          exclude_names: {
            type: "array",
            items: {
              type: "string",
            },
            description: "额外需要排除、不予关闭的应用程序名称列表，可选",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description: "用系统默认浏览器打开指定网址/网页",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: '要打开的网址，例如 "youtube.com" 或 "https://www.google.com"',
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "在当前光标位置输入一段文字（会先复制剪贴板，输入后恢复）",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "要输入的文字",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "press_keys",
      description: "发送键盘快捷键",
      parameters: {
        type: "object",
        properties: {
          keys: {
            type: "string",
            description: '快捷键，例如 "command+c", "command+v", "command+tab", "return", "escape"',
          },
        },
        required: ["keys"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_frontmost_application",
      description: "获取当前最前面的应用名称",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_selected_text",
      description: "读取当前选中的文字（通过 Command+C 复制后读取剪贴板）",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "获取当前系统日期和时间（包括星期几）",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weather_forecast",
      description: "使用 wttr.in 免费天气服务查询全球任意城市的天气。可获取实时天气、当前温度、体感温度、湿度、风速、今日最高最低温、降雨概率及未来3天预报。无需API Key。凡是天气相关问题都必须调用此工具。",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名称，中文或英文均可，例如「北京」「上海」「Tokyo」「New York」",
          },
          days: {
            type: "string",
            description: "预报天数，1-10，默认1（仅当天）",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取指定路径文件的内容（文本文件）",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径或相对用户主目录(~)的路径",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "写入内容到指定文件（覆盖写入，文件不存在则创建，会自动创建父目录）",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径或相对用户主目录(~)的路径",
          },
          content: {
            type: "string",
            description: "要写入的完整内容",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "创建一个新文件（如果文件已存在会报错，避免误覆盖）",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径或相对用户主目录(~)的路径",
          },
          content: {
            type: "string",
            description: "文件初始内容，默认为空",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "删除指定文件或空目录",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "要删除的文件或空目录的绝对路径",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "列出指定目录下的文件和文件夹",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录路径，默认为用户桌面",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_shell_command",
      description: "执行终端命令（shell command），可以安装软件、管理文件、运行脚本等。用于以上工具无法覆盖的场景",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的终端命令",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "在 macOS 备忘录(Notes)应用中创建一条新备忘录",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "备忘录标题",
          },
          body: {
            type: "string",
            description: "备忘录正文内容",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "在 macOS 提醒事项(Reminders)应用中创建一条新提醒，可设置提醒时间",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "提醒内容",
          },
          due_date: {
            type: "string",
            description: "提醒时间，格式为「YYYY-MM-DD HH:MM」，例如「2026-06-27 14:30」。如不指定则不设时间",
          },
          notes: {
            type: "string",
            description: "备注（可选）",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "在 macOS 日历(Calendar)应用中创建一个新事件",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "事件标题",
          },
          start_date: {
            type: "string",
            description: "开始时间，格式为「YYYY-MM-DD HH:MM」，例如「2026-06-27 14:00」",
          },
          end_date: {
            type: "string",
            description: "结束时间，格式同上。如不指定则默认1小时后",
          },
          location: {
            type: "string",
            description: "地点（可选）",
          },
          notes: {
            type: "string",
            description: "备注（可选）",
          },
        },
        required: ["title", "start_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "获取 macOS 日历中接下来指定天数内的事件",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "string",
            description: "查询未来多少天内的事件，默认7天",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "在 macOS 备忘录中搜索包含指定关键词的笔记",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "设置一个倒计时计时器，到时间后播放提示音并弹出系统通知",
      parameters: {
        type: "object",
        properties: {
          seconds: {
            type: "string",
            description: "计时秒数，例如「300」表示5分钟",
          },
        },
        required: ["seconds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_alarm",
      description: "设置一个闹钟到指定时间，到时间会响铃并弹出系统通知。用于「明天早上7点叫醒我」「设一个下午3点的闹钟」等场景。",
      parameters: {
        type: "object",
        properties: {
          time: {
            type: "string",
            description: "闹钟时间，格式为「YYYY-MM-DD HH:MM」，例如「2026-06-27 07:00」。如果用户说「明天早上7点」，请先调用 get_current_time 获取当前日期，再计算出完整日期时间。",
          },
          label: {
            type: "string",
            description: "闹钟标签/备注（可选）",
          },
        },
        required: ["time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_maps",
      description: "在 macOS 地图(Maps)应用中搜索地点",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "要搜索的地点名称或地址",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sports_schedule",
      description: "查询足球联赛赛程（英超、西甲、德甲、意甲、法甲、欧冠、欧联、中超、日职联、韩职联等）。用户问比赛赛程、对阵、时间时使用此工具，不要用 web_search。",
      parameters: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "联赛名称，如「英超」「西甲」「欧冠」「中超」等",
          },
        },
        required: ["league"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "download_media",
      description: "使用 yt-dlp 免费下载网络上的视频或音频（支持YouTube、Bilibili、抖音等数千个网站）。文件会被自动保存到用户的下载（Downloads）文件夹中。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要下载的视频、音频或网页的 URL 链接",
          },
          type: {
            type: "string",
            enum: ["video", "audio"],
            description: "下载类型，'video' 表示下载完整视频，'audio' 表示只下载并提取音频（如 MP3）",
          },
          destination: {
            type: "string",
            description: "下载文件的保存目录路径，可选。例如 '~/Desktop' 表示桌面。如果不提供，默认保存到用户的下载文件夹 (Downloads)。",
          },
        },
        required: ["url"],
      },
    },
  },
];

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}
