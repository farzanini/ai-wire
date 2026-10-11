// Translates short texts in the browser. Tries Chrome's built-in on-device translator first,
// then two free web services. Throws if none of them answers.
export const TARGET = { code: "fa", name: "Persian", rtl: true };

type BuiltIn = {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(t: string): Promise<string> }>;
};

async function builtIn(texts: string[]): Promise<string[]> {
  const T = (globalThis as unknown as { Translator?: BuiltIn }).Translator;
  if (!T) throw new Error("no built-in translator");
  const pair = { sourceLanguage: "en", targetLanguage: TARGET.code };
  if ((await T.availability(pair)) === "unavailable") throw new Error("pair unavailable");
  const t = await T.create(pair);
  return Promise.all(texts.map((x) => t.translate(x)));
}

async function getJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function google(texts: string[]): Promise<string[]> {
  return Promise.all(texts.map(async (x) => {
    const d = await getJson("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + TARGET.code + "&dt=t&q=" + encodeURIComponent(x));
    const out = (d[0] as [string][]).map((p) => p[0]).join("");
    if (!out) throw new Error("empty");
    return out;
  }));
}

function chunks(text: string, max = 450) {
  const parts: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (cur && (cur + " " + s).length > max) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
  }
  if (cur) parts.push(cur);
  return parts.flatMap((p) => (p.length > max ? p.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) || [p] : [p]));
}

async function myMemory(texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const x of texts) {
    const done: string[] = [];
    for (const c of chunks(x)) {
      const d = await getJson("https://api.mymemory.translated.net/get?langpair=en|" + TARGET.code + "&q=" + encodeURIComponent(c));
      if (Number(d.responseStatus) !== 200 || !d.responseData?.translatedText) throw new Error("service refused");
      done.push(d.responseData.translatedText);
    }
    out.push(done.join(" "));
  }
  return out;
}

export async function translate(texts: string[]): Promise<string[]> {
  for (const way of [builtIn, google, myMemory]) {
    try { return await way(texts); } catch { /* try the next one */ }
  }
  throw new Error("translation unavailable");
}

export const translatedPage = (url: string) =>
  "https://translate.google.com/translate?sl=auto&tl=" + TARGET.code + "&u=" + encodeURIComponent(url);
