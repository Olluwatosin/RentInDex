import Groq from "groq-sdk";

export async function callLLM(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  maxTokens: number = 500
): Promise<string> {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ] as Parameters<typeof groq.chat.completions.create>[0]["messages"],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Groq");
    return content;
  } catch (groqErr) {
    console.error("Groq failed, trying OpenRouter:", groqErr);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://rentindex.com.ng",
          "X-Title": "RentInDex",
        },
        body: JSON.stringify({
          model: "mistralai/mistral-7b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenRouter");
      return content;
    } catch (orErr) {
      console.error("OpenRouter also failed:", orErr);
      return "I'm having trouble connecting right now. Please try again in a moment.";
    }
  }
}
