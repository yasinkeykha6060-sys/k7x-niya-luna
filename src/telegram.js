function token() {
  const value = process.env.BOT_TOKEN || "";
  if (!value) throw new Error("BOT_TOKEN نیست.");
  return value;
}

export async function callTelegram(method, body) {
  const longPoll = Number(body?.timeout) || 0;
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout((longPoll + 15) * 1000),
  });
  const json = await response.json();
  if (!json.ok) {
    const error = new Error(json.description || method);
    error.code = json.error_code;
    throw error;
  }
  return json.result;
}
