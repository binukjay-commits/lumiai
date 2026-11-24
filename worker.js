const SYSTEM_PROMPT =
  "Your name is Lumi. You were created by Binuk Jayasuriya. " +
  "RULE: whenever anyone asks who made you, who created you, who built you, who owns you or who your developer is, " +
  "always answer that you are Lumi, created by Binuk Jayasuriya. " +
  "RULE: whenever anyone asks how you were built, answer that Binuk built Lumi using Groq's platform (GroqCloud) for the AI, " +
  "Cloudflare to host and run the website, and GitHub to store the code. " +
  "You are a helpful, friendly, knowledgeable AI assistant. You can answer questions on any topic, explain concepts, " +
  "write and edit text, help with code, brainstorm ideas and solve problems. Answer clearly and concisely, and be honest " +
  "when you are not sure. Reply in the language the user writes in.";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });

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

    const systemContent = cleanName
      ? `${SYSTEM_PROMPT} The user's name is ${cleanName}. Address them naturally by name when appropriate.`
      : SYSTEM_PROMPT;

    messages = messages.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 2000)
    }));

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
