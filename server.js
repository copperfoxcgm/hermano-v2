// ─────────────────────────────────────────────
// HERMANO v2 — Spanish Practice Server
// One file. Express + Anthropic + ElevenLabs.
// ─────────────────────────────────────────────
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname)); // serves index.html

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "ErXwobaYiN019PkySvjV"; // Antoni

// ── Curriculum ────────────────────────────────
const LESSONS = {
  daily: [
    { title: "Greetings", vocab: ["Hola", "Buenos días", "Buenas tardes", "Buenas noches", "¿Cómo estás?", "Mucho gusto", "Me llamo..."] },
    { title: "Numbers & Shopping", vocab: ["uno a veinte (1-20)", "¿Cuánto cuesta?", "Es muy caro", "Quiero comprar...", "El precio"] },
    { title: "Directions", vocab: ["¿Dónde está...?", "A la derecha", "A la izquierda", "Siga derecho", "Cerca", "Lejos"] },
    { title: "Neighbors & Community", vocab: ["¿Cómo le va?", "Bienvenido al barrio", "¿Necesita ayuda?", "Con permiso", "Disculpe"] },
    { title: "Medical & Emergency", vocab: ["Me duele...", "Necesito un doctor", "Llame a la policía", "¿Habla español?", "Tengo una emergencia"] },
  ],
  ministry: [
    { title: "Sunday Greetings", vocab: ["Bienvenidos", "El Señor te bendiga", "¿Cómo está usted?", "Hermano / Hermana", "Paz y bien"] },
    { title: "Worship & Prayer", vocab: ["Vamos a orar", "Alabanza", "Gloria a Dios", "Amén", "Señor ten misericordia", "Gracias Señor"] },
    { title: "Scripture & Word", vocab: ["La Palabra de Dios", "Leamos la Biblia", "El versículo dice...", "Así dice el Señor"] },
    { title: "Evangelism & Outreach", vocab: ["¿Conoces a Jesús?", "Dios te ama", "Jesucristo es el Señor", "¿Puedo orar por ti?"] },
    { title: "Altar & Ministry", vocab: ["Pasa al altar", "Repite después de mí", "Acepta a Cristo", "Estás perdonado", "Nueva vida en Cristo"] },
  ],
  pronunciation: [
    { title: "Vowels", vocab: ["a (ah)", "e (eh)", "i (ee)", "o (oh)", "u (oo)"] },
    { title: "Key Consonants", vocab: ["r (soft trill)", "rr (strong trill)", "ll (like y)", "ñ (like ny)", "j (like h)"] },
    { title: "Greeting Phrases", vocab: ["Buenos días [BWEH-nos DEE-as]", "¿Cómo estás? [KOH-moh ehs-TAHS]", "Mucho gusto [MOO-choh GOOS-toh]"] },
    { title: "Church Words", vocab: ["Aleluya [ah-leh-LOO-yah]", "Bienvenidos [byehn-veh-NEE-dos]", "Misericordia [mee-seh-ree-KOR-dyah]", "Jesucristo [heh-soo-KREES-toh]"] },
    { title: "Full Sentences", vocab: ["Complete phrase practice with natural rhythm and flow"] },
  ],
};

// ── Markdown stripper ─────────────────────────
function stripMarkdown(t) {
  return t
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── System prompt ─────────────────────────────
function buildPrompt(mode, level, lesson) {
  const levelRules = {
    beginner: "Use simple vocabulary and very short sentences.",
    intermediate: "Use moderate vocabulary and natural sentences.",
    advanced: "Use rich vocabulary, idioms, and cultural nuance.",
  };
  const modeRules = {
    daily: "Focus on everyday Spanish for Queens, NY — greetings, shopping, directions, neighbors, doctors, transportation.",
    ministry: "Focus on church Spanish — worship, prayer, altar calls, evangelism, scripture, greeting church members.",
    pronunciation: "Teach ONE phrase at a time with phonetic spelling in brackets like [OH-lah]. Ask the student to repeat it. Give specific feedback on their attempt.",
    free: "Natural open conversation. Follow the student's lead.",
  };

  let prompt = `You are Hermano, a warm but rigorous Spanish coach for English-speaking Christians at a Church of God congregation in New York.

FORMAT RULES — follow exactly:
- Spanish first, then English translation on the next line starting with 🇺🇸
- Entire response under 80 words
- NO markdown: no ##, no **, no bullets, no numbered lists
- ONE phrase or exchange at a time
- Conversational, like a real person — never a textbook
- Never repeat the same phrase twice in one response
- End with ONE short practice question

CORRECTION RULES — never let mistakes slide:
- Correct EVERY grammar, vocabulary, or word-order error the student makes
- Show the incorrect part, then the correct version clearly
- Explain in one short simple sentence WHY it was wrong
- Ask the student to try the corrected phrase again before moving on
- Be encouraging but firm — a good teacher who cares about real progress

STUDENT LEVEL: ${level}. ${levelRules[level] || levelRules.beginner}
MODE: ${mode}. ${modeRules[mode] || modeRules.daily}`;

  const list = LESSONS[mode];
  if (list && lesson >= 1 && lesson <= list.length) {
    const l = list[lesson - 1];
    prompt += `

CURRENT LESSON: Lesson ${lesson} of 5 — ${l.title}
Vocabulary for this lesson ONLY: ${l.vocab.join(", ")}

LESSON RULES:
- Teach ONLY the vocabulary above. Never introduce phrases from other lessons.
- Do not advance until the student correctly uses at least 5 items (or all items if fewer than 5).
- When the student clearly masters the lesson, celebrate briefly, then add the exact token [LESSON_COMPLETE] on its own line at the very end.
- Track their progress across the whole conversation.`;
  }
  return prompt;
}

// ── /api/chat ─────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, mode = "daily", level = "beginner", lesson = 1 } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    if (!ANTHROPIC_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY not set. Add it in Secrets." });
    }

    // sanitize: cap history, cap message length, keep roles valid
    const safe = messages
      .slice(-30)
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: buildPrompt(mode, level, Number(lesson) || 1),
        messages: safe,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Anthropic error:", r.status, errText);
      return res.status(502).json({ error: "AI request failed (" + r.status + ")" });
    }

    const data = await r.json();
    const raw = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const text = stripMarkdown(raw);
    const lessonComplete = text.includes("[LESSON_COMPLETE]");
    res.json({
      text: text.replace(/\[LESSON_COMPLETE\]/g, "").trim(),
      lessonComplete,
    });
  } catch (e) {
    console.error("chat error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── /api/tts ──────────────────────────────────
app.post("/api/tts", async (req, res) => {
  try {
    const { text, speed = 1.0 } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "text required" });
    if (!ELEVENLABS_KEY) return res.status(204).send(); // graceful: no audio

    const clamped = Math.min(Math.max(Number(speed) || 1.0, 0.5), 1.5);

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.slice(0, 1500),
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: clamped },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("ElevenLabs error:", r.status, errText);
      return res.status(204).send();
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch (e) {
    console.error("tts error:", e);
    res.status(204).send();
  }
});

// ── health + fallback ─────────────────────────
app.get("/api", (_req, res) => res.json({ ok: true, app: "hermano-v2" }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log("Hermano v2 running on port " + PORT);
  console.log("Anthropic key:", ANTHROPIC_KEY ? "✓ set" : "✗ MISSING");
  console.log("ElevenLabs key:", ELEVENLABS_KEY ? "✓ set" : "✗ MISSING");
});
