import { GoogleGenerativeAI } from "npm:@google/generative-ai";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
    });
  }

  try {
    const { topic, skill, count } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const result = await model.generateContent(
      `Generate ${count} ${skill} level MCQ questions on ${topic}.
       Each question must have exactly 4 options and one correct answer.
       Return JSON only.`
    );

    return new Response(
      JSON.stringify({ result: result.response.text() }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Gemini failed" }), {
      status: 500,
    });
  }
});
