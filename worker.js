// Lumi backend (Cloudflare Worker): serves the page and keeps your Groq key secret.
const SYSTEM_PROMPT =
  "You are Lumi, a helpful, friendly, knowledgeable AI assistant. You can answer questions on any topic, explain concepts, " +
  "write and edit text, help with code, brainstorm ideas and solve problems. Answer clearly and concisely, and be honest " +
  "when you are not sure. Reply in the language the user writes in.";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/chat") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.GROQ_API_KEY) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
    let messages = body && body.messages;
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: "No messages" }, 400);

    messages = messages.slice(-12).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 2000)
    }));

    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
         max_tokens: 2000
        })
      });
      const data = await r.json();
      if (!r.ok) return json({ error: (data.error && data.error.message) || "AI provider error" }, 502);
      return json({ reply: data.choices[0].message.content });
    } catch (e) {
      return json({ error: "Something went wrong" }, 500);
    }
  }
};
