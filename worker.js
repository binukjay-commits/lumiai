const SYSTEM_PROMPT =
  "Your name is Lumi. You were created by Binuk Jayasuriya. " +
  "RULE: whenever anyone asks who made you, who created you, who built you, who owns you or who your developer is, " +
  "always answer that you are Lumi, created by Binuk Jayasuriya. " +
  "RULE: whenever anyone asks how you were built, answer that Binuk built Lumi using Groq's platform (GroqCloud) for the AI, " +
  "Cloudflare to host and run the website, and GitHub to store the code. " +
  "You are a helpful, friendly, knowledgeable AI assistant. You can answer questions on any topic, explain concepts, " +
  "write and edit text, help with code, brainstorm ideas and solve problems. Answer clearly and concisely, and be honest " +
  "when you are not sure. Reply in the language the user writes in. " +
  "Only state date, time, or weather details that are explicitly provided in the system context.";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });

function getSriLankaDateTime() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(now);
  return `${formatted} (Asia/Colombo, GMT+5:30)`;
}

function isWeatherQuery(text) {
  return /\b(weather|temperature|temp|rain|forecast|humidity|wind|hot|cold|cloudy|sunny|storm)\b/i.test(text);
}

function extractCity(text) {
  const match = text.match(/\b(?:in|at|for)\s+([a-zA-Z][a-zA-Z\s-]{1,30})(?:\s+(?:today|tomorrow|now|weather))?\b/i);
  if (!match) return "Panadura";
  const candidate = match[1].trim();
  if (/^(today|tomorrow|tonight|now|here|me|my)$/i.test(candidate)) return "Panadura";
  return candidate;
}

async function fetchWeatherSummary(city) {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    const geoData = await geoRes.json();
    const place = geoData && geoData.results && geoData.results[0];
    if (!place) return null;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=Asia%2FColombo`
    );
    const wxData = await wxRes.json();
    const cur = wxData && wxData.current;
    if (!cur) return null;

    return (
      `Current weather in ${place.name}: temperature ${cur.temperature_2m}°C ` +
      `(feels like ${cur.apparent_temperature}°C), humidity ${cur.relative_humidity_2m}%, ` +
      `wind ${cur.wind_speed_10m} km/h, weather code ${cur.weather_code}.`
    );
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/chat") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.GROQ_API_KEY) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }

    let messages = body && body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "No messages" }, 400);
    }

    const cleanName = typeof body.userName === "string"
      ? body.userName.replace(/[\r\n]+/g, " ").trim().slice(0, 40)
      : "";

    messages = messages.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 2000)
    }));

    const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const extraContext = [`Current date and time: ${getSriLankaDateTime()}.`];

    if (cleanName) {
      extraContext.push(`The user's name is ${cleanName}. Address them naturally by name when appropriate.`);
    }

    if (isWeatherQuery(lastUserText)) {
      const city = extractCity(lastUserText);
      const wx = await fetchWeatherSummary(city);
      if (wx) extraContext.push(wx);
    }

    const systemContent = `${SYSTEM_PROMPT} ${extraContext.join(" ")}`;

    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.GROQ_API_KEY
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [{ role: "system", content: systemContent }, ...messages],
          max_tokens: 2000
        })
      });
      const data = await r.json();
      if (!r.ok) {
        return json({ error: (data.error && data.error.message) || "AI provider error" }, 502);
      }
      return json({ reply: data.choices[0].message.content });
    } catch (e) {
      return json({ error: "Something went wrong" }, 500);
    }
  }
};
