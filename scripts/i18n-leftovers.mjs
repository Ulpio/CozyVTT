// Lists English text left in the screens and server messages that P8 translates.
// Support tool, not a gate: always exits 0. Dependency-free (node fs/path only).
//   node scripts/i18n-leftovers.mjs [--server]
import fs from 'node:fs';
import path from 'node:path';

const UI_SCOPE = [
  'frontend/src/components/character-sheets/fifth-edition/**',
  'frontend/src/components/campaign/{ChatPanel,ChatMessage,DiceRoller,DiceMacroManager,CharacterRollPicker,NpcRollPicker,InitiativeTracker,PersonalNotes,SessionHistory,EndSessionModal,CampaignRoster,TokenRoster,InvitePlayerModal,MapCanvas,TokenManager,MapManager,CreateMapModal,EditMapModal,CampaignSettingsModal,GmWallControls,GmLightControls,GmFogControls,SessionToolbar,TableRefusals}.tsx',
  'frontend/src/components/campaign/{sessionTabs.ts,map/tokenMenuItems.ts,map/doorMenuItems.ts,map/previewSelection.ts}',
  'frontend/src/components/campaign/compact/**',
  'frontend/src/contexts/CampaignContext.tsx',
  'frontend/src/pages/{CampaignPage,CharactersPage,CharacterEditorPage}.tsx',
  'frontend/src/components/character/NewCharacterModal.tsx',
  'frontend/src/utils/conditions.ts',
];
const SERVER_SCOPE = [
  'backend/src/websocket/**',
  'backend/src/routes/{maps,characters,campaigns,campaignMacros,invitations,abilityRolls}.ts',
  'backend/src/services/**',
];
// Protocol strings the client compares, and the English keys of gmToolRefusal.
const ALLOW = [
  'Unauthorized',
  'Rate limit exceeded',
  'Not connected to server',
  'No answer from the server',
  "The check didn't come back. Check your connection and try again.",
  'Too many items given at once. Wait a moment, then try again.',
  'Too many notices at once. Wait a moment, then try again.',
  'Too many secret checks at once. Wait a moment, then try again.',
  'Failed to give the item',
  'Failed to send the notice',
  'Failed to roll the secret check',
];

const ENGLISH = new Set(`the to of not only can cannot no add edit delete remove save cancel close roll map token wall light fog found failed invalid must is are you your select show hide new name search and or for with from this that it be was has have will would should could any all each when then than into out off on in at by an a not yet please try again wait too many much more less open create update rename copy paste move drag drop click tap press enter type choose pick set unset reset clear apply done next back previous continue skip confirm sure error warning info loading saved sent send give take get put make let use used using need needs allowed forbidden missing required unknown unavailable available full empty first last other another one two three item items notice check checks player players character characters campaign campaigns session sessions message messages user users owner own owned your yours their his her them they who what which where why how there here now already still just also but if else does did do done failed fail failure cannot couldn wasn isn aren doesn didn won wouldn shouldn invite invitation invited accept decline join leave kick ban role roles group groups tab tabs page pages table tables list lists file files image images upload download share shared private public hidden visible draw drawing erase door window doors windows lights fogs walls maps tokens rolls dice die initiative turn turns round rounds hp ac level spell spells slot slots condition conditions note notes history end start stop pause resume view edit editor settings setting option options default value values amount total result results`.split(/\s+/));
const ACCENT = /[ãõçáéíóúâêôà]/i;

// ---- tiny glob: ** (any depth), * (no slash), {a,b}
function expandBraces(p) {
  const m = p.match(/\{([^{}]*)\}/);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expandBraces(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length)));
}
function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
const matchers = (scope) => scope.flatMap(expandBraces).map(globToRegex);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.posix.join(dir.replace(/\\/g, '/'), e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function isEnglish(text) {
  const t = text.trim();
  if (!t || ACCENT.test(t)) return false;
  if (ALLOW.some((a) => t.startsWith(a))) return false;
  const words = t.toLowerCase().match(/[a-z]{2,}/g) || [];
  return words.some((w) => ENGLISH.has(w) && (w.length >= 3 || w === 'is' || w === 'to' || w === 'of' || w === 'no'));
}

const UI_PATTERNS = [
  />\s*([A-Z][A-Za-z][^<>{}\n]*?)\s*</g,
  /\b(?:title|placeholder|aria-label|label)="([^"]+)"/g,
  /\blabel:\s*'((?:[^'\\]|\\.)*)'/g,
  /\blabel:\s*"([^"]*)"/g,
  /\b(?:showToast|toast|setError)\(\s*'((?:[^'\\]|\\.)*)'/g,
  /\b(?:showToast|toast|setError)\(\s*"([^"]*)"/g,
  /\b(?:showToast|toast|setError)\(\s*`([^`$]*)`/g,
];
const SERVER_PATTERNS = [
  /\b(?:message|error|reason):\s*'((?:[^'\\]|\\.)*)'/g,
  /\b(?:message|error|reason):\s*"([^"]*)"/g,
  /\b(?:message|error|reason):\s*`([^`$]*)`/g,
  /new\s+\w*Error\(\s*'((?:[^'\\]|\\.)*)'/g,
  /new\s+\w*Error\(\s*"([^"]*)"/g,
  /\bthrow\s+\w+\(\s*'((?:[^'\\]|\\.)*)'/g,
  /\bthrow\s+\w+\(\s*"([^"]*)"/g,
];

const server = process.argv.includes('--server');
const scope = matchers(server ? SERVER_SCOPE : UI_SCOPE);
const patterns = server ? SERVER_PATTERNS : UI_PATTERNS;
const roots = server ? ['backend/src'] : ['frontend/src'];
const files = roots.flatMap((r) => walk(r)).filter((f) =>
  /\.(ts|tsx)$/.test(f) && !/\.test\.[tj]sx?$/.test(f) && scope.some((re) => re.test(f))).sort();

let count = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (/\b(?:logger|console)\./.test(line)) return;
    let hit = false;
    for (const re of patterns) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) if (isEnglish(m[1])) { hit = true; break; }
      if (hit) break;
    }
    if (hit) { count++; console.log(`${f}:${i + 1}: ${code}`); }
  });
}
console.log(`${count} leftovers`);
