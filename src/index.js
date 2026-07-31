import mainPage from "./pages/main.html";
import slowdownPage from "./pages/slowdown.html";
import warningPage from "./pages/warning.html";
import cssStyles from "./pages/style.css";

import bannedWords from "./data/banned_words.json";
import userCustomization from "./data/user_customization.json";

const ipRateLimit = new Map();
const MAX_CHAR_LIMIT = 20;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function containsSlur(text) {
  const lower = text.toLowerCase();
  return bannedWords.some(word => lower.includes(word));
}

function formatUsername(name) {
  const cleanName = escapeHtml(name);
  const style = userCustomization[name];

  if (!style) {
    return cleanName;
  }

  if (style.toLowerCase() === "rainbow") {
    return `<span class="rainbow-text">${cleanName}</span>`;
  }

  return `<span style="color: ${escapeHtml(style)}; font-weight: bold;">${cleanName}</span>`;
}

function renderTemplate(htmlContent, replacements = {}) {
  let output = htmlContent.replace("{{CSS_INLINE}}", cssStyles);
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // css serving like a fresh bottle of coke god im hungry
    if (url.pathname === "/style.css" || url.pathname === "/styles.css") {
      return new Response(cssStyles, {
        headers: { "Content-Type": "text/css; charset=utf-8" }
      });
    }

    // rules
    if (url.pathname === "/rules") {
      const rulesHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rules</title>
    <style>
        ${cssStyles}
        body { padding: 20px; background: #f0f0f0; }
        ul { margin-top: 10px; }
        li { margin-bottom: 8px; }
        a { text-decoration: none; color: blue; }
    </style>
</head>
<body>
    <h1>Rules</h1>
    <ul>
        <li>1. no slurs or other shit pls im lazy to moderate ts</li>
        <li>2. character limit is ${MAX_CHAR_LIMIT}. no negociations</li>
        <li>3. no youtube videos anymore since someone posted dog anus</li>
        <li>4. yes</li>
        <li>if you want your username/message removed, dm @sy62e on discord</li>
    </ul>
    <br>
    <a href="/">&larr; back to the mess</a>
</body>
</html>`;
      return new Response(rulesHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (request.method === "POST" && url.pathname === "/submit") {
      try {
        const formData = await request.formData();
        const username = (formData.get("username") || "").trim();

        const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
        const now = Date.now();
        const lastSubmit = ipRateLimit.get(clientIp) || 0;

        if (now - lastSubmit < 10000) {
          return new Response(renderTemplate(slowdownPage), {
            status: 429,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }

        ipRateLimit.set(clientIp, now);

        if (username) {
          if (username.length > MAX_CHAR_LIMIT) {
            return new Response("username too long mf (max 20 chars)", { status: 400 });
          }

          if (containsSlur(username)) {
            if (env.DISCORD_WEBHOOK_URL) {
              await fetch(env.DISCORD_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: "a guy typed some bullshit and im warning his ass"
                })
              });
            }

            return new Response(renderTemplate(warningPage), {
              status: 400,
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
          }

          let currentList = await env.BOUNCERS_KV.get("users_json", { type: "json" }) || [];

          if (!currentList.includes(username)) {
            currentList.push(username);
            await env.BOUNCERS_KV.put("users_json", JSON.stringify(currentList));
          }

          if (env.DISCORD_WEBHOOK_URL) {
            await fetch(env.DISCORD_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `**new mf added:** \`${username.replace(/`/g, "")}\``
              })
            });
          }
        }

        return Response.redirect(url.origin + "?submitted=true", 302);
      } catch (err) {
        return new Response("error bc the server is shit", { status: 500 });
      }
    }

    const bouncersList = await env.BOUNCERS_KV.get("users_json", { type: "json" }) || [];

    const bouncersHtml = bouncersList.length > 0
      ? bouncersList.map(name => `<li>${formatUsername(name)}</li>`).join("")
      : "<li>no booty bouncers :wompwomp:</li>";

    const submitted = url.searchParams.get("submitted");
    const alertMessage = submitted ? "<p>sent ok</p>" : "";

    const finalHtml = renderTemplate(mainPage, {
      BOUNCERS_LIST: bouncersHtml,
      ALERT_MESSAGE: alertMessage,
      MAX_CHAR_LIMIT: MAX_CHAR_LIMIT
    });

    return new Response(finalHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
};