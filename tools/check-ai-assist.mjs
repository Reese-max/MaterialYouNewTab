import fs from "node:fs";
import assert from "node:assert/strict";

const ai = fs.readFileSync("scripts/ai-assist.js", "utf8");
const preload = fs.readFileSync("scripts/preload.js", "utf8");
const chromium = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const firefox = JSON.parse(fs.readFileSync("manifest(firefox).json", "utf8"));
const readme = fs.readFileSync("README.md", "utf8");
const privacy = fs.readFileSync("privacy-policy.html", "utf8");

assert.match(preload, /scripts\/ai-assist\.js/, "preload must load AI Assist from a local extension asset");
assert.match(preload, /data-mynt-ai-assist|myntAiAssist/i, "AI Assist loader must guard against duplicate injection");
assert.match(ai, /myntAiAssistSettings/, "AI Assist settings key is missing");
for (const provider of ["auto", "chrome", "local", "off"]) {
    assert.match(ai, new RegExp(`\\b${provider}\\b`), `Provider ${provider} is missing`);
}
assert.match(ai, /LanguageModel\.availability/, "Chrome built-in AI availability check is missing");
assert.match(ai, /LanguageModel\.create/, "Chrome built-in AI session creation is missing");
assert.match(ai, /localPlan\(/, "Local planner fallback is missing");
assert.match(ai, /localOrganize\(/, "Local Scratchpad fallback is missing");
assert.match(ai, /mynt:todo-create/, "Scratchpad-to-Todo action is missing");
assert.match(ai, /myntTodayPlan/, "Today-plan integration is missing");
assert.match(ai, /Chrome built-in AI unavailable; using local fallback/, "Auto fallback path is missing");
assert.doesNotMatch(ai, /OPENAI_API_KEY|GEMINI_API_KEY|sk-[A-Za-z0-9_-]{12,}/, "AI Assist must not embed API credentials");
assert.doesNotMatch(ai, /https?:\/\//, "AI Assist v1 must not call remote AI endpoints");
assert.equal(chromium.version, "3.5.0", "Chromium version must be 3.5.0");
assert.equal(firefox.version, "3.5.0", "Firefox version must be 3.5.0");
assert.match(readme, /AI Assist/i, "README must document AI Assist");
assert.match(readme, /3\.5\.0/, "README must document version 3.5.0");
assert.match(privacy, /AI Assist（3\.5\.0 起）/, "Privacy policy must disclose AI Assist");
assert.match(privacy, /沒有 MYNT 雲端 AI endpoint/, "Privacy policy must disclose the no-cloud boundary");
assert.match(privacy, /套用建議/, "Privacy policy must disclose explicit user application of suggestions");

console.log('AI_ASSIST_CHECK_OK providers=4 cloud=none version=3.5.0 privacy=disclosed');
