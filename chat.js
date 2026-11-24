// Backend (Cloudflare Pages Function): keeps your API key secret and talks to Groq's free API.
const SYSTEM_PROMPT =
  "You are a helpful, friendly, knowledgeable AI assistant. You can answer questions on any topic, explain concepts, " +
  "write and edit text, help with code, brainstorm ideas and solve problems. Answer clearly and concisely, and be honest " +
  "when you are not sure. Reply in the language the user writes in.";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  if (!env.GROQ_API_KEY) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  let messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return json({ error: "No messages" }, 400);

  // Safety limits so nobody can burn your free quota with giant requests
  messages = messages.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 2000)
  }));

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 700
      })
    });
    const data = await r.json();
    if (!r.ok) return json({ error: (data.error && data.error.message) || "AI provider error" }, 502);
    return json({ reply: data.choices[0].message.content });
  } catch (e) {
    return json({ error: "Something went wrong" }, 500);
  }
}
