import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { topic, skill, count } = req.body;

    if (!topic || !skill || !count) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY missing");
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // ✅ CORRECT MODEL
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const result = await model.generateContent(
      `Generate ${count} ${skill} level MCQ questions on ${topic}.
Each question must have exactly 4 options and one correct answer.
Return JSON only.`
    );

    return res.status(200).json({
      result: result.response.text(),
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return res.status(500).json({
      error: err.message || "Function crashed",
    });
  }
}
