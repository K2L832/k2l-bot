// Build Revision: Kyuro-Casino-v9.0-Auctions-Roulette-BJ (Prefix: *)
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ChannelType
} = require('discord.js');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

let NapiCanvas = null;
try {
    NapiCanvas = require('@napi-rs/canvas');
} catch (_) {
    NapiCanvas = null;
}

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Kyuro Casino v9.0 OK\n');
}).listen(PORT, '0.0.0.0', () => console.log(`HTTP actif sur le port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '*';
const CURRENCY = '$';
const SUPER_OWNER_ID = '1166445202148442112';
const SUPER_OWNER_HANDLES = new Set(['graveuhq', 'k2l', '77jc']);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'kyuro-casino-data.json');
const activeBlackjacks = new Map();
const activeDuels = new Map();
const activeAuctions = new Map();
const BUILDINGS_CATALOG = {
    studio: { id: 'studio', name: 'Kyuro Loft', price: 8500, rentPerResident: 65, maxResidents: 4, tier: 1 },
    residence: { id: 'residence', name: 'Tour Azur', price: 22000, rentPerResident: 150, maxResidents: 8, tier: 2 },
    penthouse: { id: 'penthouse', name: 'Skyline Tower', price: 50000, rentPerResident: 320, maxResidents: 12, tier: 3 },
    citadel: { id: 'citadel', name: 'Kyuro Citadel', price: 110000, rentPerResident: 680, maxResidents: 20, tier: 4 }
};

const DEFAULT_CRYPTOS = {
    BTC: { name: 'Bitcoin', price: 68500, history: [64200, 65100, 64800, 66700, 67900, 68500] },
    ETH: { name: 'Ethereum', price: 3450, history: [3180, 3240, 3210, 3320, 3390, 3450] },
    KYR: { name: 'Kyuro Coin', price: 1250, history: [820, 910, 980, 1050, 1180, 1250] },
    SOL: { name: 'Solana', price: 215, history: [185, 192, 189, 201, 208, 215] }
};

let db = {
    users: {},
    cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)),
    casinoCategories: {},
    owners: []
};

function isSuperOwner(user) {
    if (!user) return false;
    if (user.id === SUPER_OWNER_ID) return true;
    const u = (user.username || '').toLowerCase();
    const g = (user.globalName || '').toLowerCase();
    return SUPER_OWNER_HANDLES.has(u) || SUPER_OWNER_HANDLES.has(g);
}

function isBotOwner(user) {
    if (!user) return false;
    if (isSuperOwner(user)) return true;
    return Array.isArray(db.owners) && db.owners.includes(user.id);
}

function saveData() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmpFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
        fs.renameSync(tmpFile, DATA_FILE);
    } catch (e) {
        console.error('Erreur sauvegarde:', e.message);
    }
}

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object') {
            db.users = parsed.users || {};
            db.cryptos = parsed.cryptos && Object.keys(parsed.cryptos).length > 0 ? parsed.cryptos : JSON.parse(JSON.stringify(DEFAULT_CRYPTOS));
            db.casinoCategories = parsed.casinoCategories && typeof parsed.casinoCategories === 'object' ? parsed.casinoCategories : {};
            db.owners = Array.isArray(parsed.owners) ? parsed.owners : [];
        }
    } catch (e) {
        console.error('Erreur chargement:', e.message);
    }
}

loadData();
function getGuildCasinoCategory(guildId) {
    if (!guildId || !db.casinoCategories) return null;
    return db.casinoCategories[guildId] || null;
}

function setGuildCasinoCategory(guildId, categoryId) {
    if (!db.casinoCategories || typeof db.casinoCategories !== 'object') db.casinoCategories = {};
    if (!categoryId) delete db.casinoCategories[guildId];
    else db.casinoCategories[guildId] = categoryId;
    saveData();
}

function isAllowedCasinoChannel(message) {
    if (!message.guild || !message.channel) return false;
    const allowedCatId = getGuildCasinoCategory(message.guild.id);
    if (!allowedCatId) return true;
    return message.channel.parentId === allowedCatId;
}

async function resolveCategoryIdFromInput(message, rawArg) {
    const cleaned = (rawArg || '').replace(/[<#>]/g, '').trim();
    if (cleaned) {
        const fetched = await message.guild.channels.fetch(cleaned).catch(() => null);
        if (fetched) {
            if (fetched.type === ChannelType.GuildCategory) return fetched.id;
            if (fetched.parentId) return fetched.parentId;
        }
    }
    return message.channel.parentId || null;
}

function getUser(userId, discordUser = null) {
    if (!db.users[userId]) {
        db.users[userId] = {
            username: discordUser ? (discordUser.globalName || discordUser.username) : `Joueur_${userId.slice(-4)}`,
            avatarUrl: discordUser ? discordUser.displayAvatarURL({ extension: 'png', size: 256 }) : null,
            cash: 0,
            bank: 0,
            crypto: { BTC: 0, ETH: 0, KYR: 0, SOL: 0 },
            buildings: [],
            homeBuildingOwnerId: null,
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0, mine: 0, fish: 0, spin: 0 }
        };
        saveData();
    }
    const u = db.users[userId];
    if (discordUser) {
        u.username = discordUser.globalName || discordUser.username || u.username;
        u.avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
    }
    if (!u.username) u.username = `Joueur_${userId.slice(-4)}`;
    if (typeof u.cash !== 'number') u.cash = 0;
    if (typeof u.bank !== 'number') u.bank = 0;
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, KYR: 0, SOL: 0 };
    if (!Array.isArray(u.buildings)) u.buildings = [];
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0, mine: 0, fish: 0, spin: 0 };
    return u;
}

function parseAmount(rawArg, maxVal) {
    if (rawArg === undefined || rawArg === null) return null;
    const str = String(rawArg).trim().toLowerCase();
    if (!str) return null;
    if (str === 'all') return maxVal > 0 ? Math.floor(maxVal) : null;
    if (!/^\d+$/.test(str)) return null;
    const n = Number(str);
    return (Number.isSafeInteger(n) && n > 0) ? n : null;
}

function parseDurationMs(rawDur) {
    if (!rawDur) return null;
    const m = String(rawDur).trim().toLowerCase().match(/^(\d+)(s|m|h)$/);
    if (!m) return null;
    const val = parseInt(m[1], 10);
    if (val <= 0) return null;
    const mult = m[2] === 'h' ? 3600000 : m[2] === 'm' ? 60000 : 1000;
    const ms = val * mult;
    return (ms >= 10000 && ms <= 86400000) ? ms : null;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function formatMoney(v) { return `${Math.floor(v).toLocaleString('fr-FR')} ${CURRENCY}`; }
function formatCooldown(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
function fetchBinaryBuffer(url, maxRedirects = 4) {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return resolve(null);
        const mod = url.startsWith('https://') ? https : http;
        const req = mod.get(url, { timeout: 3000, headers: { 'User-Agent': 'KyuroCasinoBot/9.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
                return resolve(fetchBinaryBuffer(res.headers.location, maxRedirects - 1));
            }
            if (res.statusCode !== 200) return resolve(null);
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

async function loadAvatarImage(avatarUrl) {
    if (!NapiCanvas || !avatarUrl) return null;
    try {
        const cleanUrl = avatarUrl.replace(/\.(webp|jpg|jpeg)(\?|$)/i, '.png$2');
        let buf = await fetchBinaryBuffer(cleanUrl);
        if (!buf) buf = await fetchBinaryBuffer(avatarUrl);
        if (!buf || buf.length < 64) return null;
        return await NapiCanvas.loadImage(buf);
    } catch {
        return null;
    }
}

function applyTextGradient(ctx, x0, y0, x1, y1, c1 = '#ffffff', c2 = '#7dd3fc', c3 = '#38bdf8') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c1);
    g.addColorStop(0.55, c2);
    g.addColorStop(1, c3);
    return g;
}

function drawBlueThemeFrame(ctx, w, h, badgeText, pseudoText) {
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#020816');
    bgGrad.addColorStop(0.45, '#071f45');
    bgGrad.addColorStop(0.85, '#0c3b7a');
    bgGrad.addColorStop(1, '#1455ab');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const glowTop = ctx.createRadialGradient(w * 0.85, h * 0.14, 10, w * 0.85, h * 0.14, w * 0.52);
    glowTop.addColorStop(0, 'rgba(125, 211, 252, 0.32)');
    glowTop.addColorStop(0.55, 'rgba(56, 189, 248, 0.13)');
    glowTop.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, w, h);

    const cardGrad = ctx.createLinearGradient(14, 14, w - 14, h - 14);
    cardGrad.addColorStop(0, 'rgba(5, 19, 44, 0.95)');
    cardGrad.addColorStop(1, 'rgba(9, 33, 74, 0.93)');

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 28, 26);
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.68)';
    ctx.stroke();

    ctx.font = '700 17px Sans, Arial, sans-serif';
    const badgeW = Math.max(164, Math.ceil(ctx.measureText(badgeText).width + 36));
    ctx.beginPath();
    ctx.roundRect(32, 28, badgeW, 36, 12);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.34)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.86)';
    ctx.stroke();

    ctx.fillStyle = applyTextGradient(ctx, 32, 28, 32 + badgeW, 64, '#ffffff', '#e0f2fe', '#7dd3fc');
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 50, 47);

    if (pseudoText) {
        ctx.font = '700 19px Sans, Arial, sans-serif';
        ctx.fillStyle = applyTextGradient(ctx, w - 240, 28, w - 34, 64, '#ffffff', '#bae6fd', '#7dd3fc');
        ctx.textAlign = 'right';
        ctx.fillText(pseudoText, w - 34, 47);
    }
    ctx.restore();
}
function drawRoundedAvatar(ctx, avatarImg, cx, cy, radius) {
    ctx.save();
    const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ringGrad.addColorStop(0, '#ffffff');
    ringGrad.addColorStop(0.5, '#7dd3fc');
    ringGrad.addColorStop(1, '#0284c7');

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
        ctx.drawImage(avatarImg, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        const fb = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
        fb.addColorStop(0, '#1d4ed8');
        fb.addColorStop(1, '#0c2752');
        ctx.fillStyle = fb;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 22px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KY', cx, cy + 1);
    }
    ctx.restore();
}

function drawDieFace(ctx, x, y, size, val) {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#174691');
    g.addColorStop(1, '#0a2045');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 22);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7dd3fc';
    ctx.stroke();

    const cx = x + size / 2, cy = y + size / 2, off = size * 0.25, r = Math.max(7, size * 0.085);
    const pipMap = {
        1: [[cx, cy]],
        2: [[cx - off, cy - off], [cx + off, cy + off]],
        3: [[cx - off, cy - off], [cx, cy], [cx + off, cy + off]],
        4: [[cx - off, cy - off], [cx + off, cy - off], [cx - off, cy + off], [cx + off, cy + off]],
        5: [[cx - off, cy - off], [cx + off, cy - off], [cx, cy], [cx - off, cy + off], [cx + off, cy + off]],
        6: [[cx - off, cy - off], [cx + off, cy - off], [cx - off, cy], [cx + off, cy], [cx - off, cy + off], [cx + off, cy + off]]
    };
    ctx.fillStyle = applyTextGradient(ctx, x, y, x + size, y + size, '#ffffff', '#e0f2fe', '#38bdf8');
    for (const [px, py] of (pipMap[val] || pipMap[1])) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawRealisticScenePanel(ctx, mode, x, y, w, h, topCaption, detailText) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fillStyle = 'rgba(6, 20, 46, 0.96)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
    ctx.stroke();

    if (mode === 'FISH') {
        const water = ctx.createLinearGradient(x, y + h * 0.42, x, y + h);
        water.addColorStop(0, 'rgba(14, 165, 233, 0.25)');
        water.addColorStop(1, 'rgba(3, 105, 161, 0.55)');
        ctx.fillStyle = water;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + h * 0.50);
        ctx.quadraticCurveTo(x + w * 0.32, y + h * 0.36, x + w * 0.66, y + h * 0.52);
        ctx.quadraticCurveTo(x + w * 0.84, y + h * 0.62, x + w - 12, y + h * 0.46);
        ctx.lineTo(x + w - 12, y + h - 12);
        ctx.lineTo(x + 12, y + h - 12);
        ctx.closePath();
        ctx.fill();

        const fx = x + w * 0.54, fy = y + h * 0.58;
        ctx.fillStyle = applyTextGradient(ctx, fx - 70, fy - 25, fx + 70, fy + 25, '#ffffff', '#7dd3fc', '#38bdf8');
        ctx.beginPath();
        ctx.ellipse(fx, fy, 56, 23, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(fx - 52, fy + 3);
        ctx.lineTo(fx - 86, fy - 20);
        ctx.lineTo(fx - 86, fy + 24);
        ctx.closePath();
        ctx.fill();
    } else if (mode === 'MINE') {
        ctx.fillStyle = 'rgba(15, 38, 78, 0.85)';
        ctx.beginPath();
        ctx.roundRect(x + 14, y + h * 0.68, w - 28, h * 0.24, 12);
        ctx.fill();
        const gems = [
            { gx: x + w * 0.26, gy: y + h * 0.62, r: 24 },
            { gx: x + w * 0.50, gy: y + h * 0.52, r: 34 },
            { gx: x + w * 0.74, gy: y + h * 0.64, r: 22 }
        ];
        for (const g of gems) {
            ctx.fillStyle = applyTextGradient(ctx, g.gx - g.r, g.gy - g.r, g.gx + g.r, g.gy + g.r, '#ffffff', '#7dd3fc', '#0284c7');
            ctx.beginPath();
            ctx.moveTo(g.gx, g.gy - g.r);
            ctx.lineTo(g.gx + g.r * 0.85, g.gy);
            ctx.lineTo(g.gx, g.gy + g.r);
            ctx.lineTo(g.gx - g.r * 0.85, g.gy);
            ctx.closePath();
            ctx.fill();
        }
    } else if (mode === 'HACK' || mode === 'HEIST' || mode === 'WORK' || mode === 'CRIME') {
        const linesByMode = {
            HACK: ['> SSH KYURO-NODE-09 [OK]', '> FIREWALL BYPASSED', '> PAYLOAD INJECTED'],
            HEIST: ['> VAULT SECURITY : OFFLINE', '> GOLD RESERVES : LOADED', '> EXTRACTION : ACTIVE'],
            WORK: ['> SHIFT : COMPLETED', '> CONTRACT : VERIFIED', '> PAYROLL : SENT'],
            CRIME: ['> OPERATION : IN PROGRESS', '> RADAR : SCANNING', '> STATUS : RESOLVED']
        };
        (linesByMode[mode] || []).forEach((ln, idx) => {
            ctx.fillStyle = idx === 0 ? '#7dd3fc' : '#e0f2fe';
            ctx.font = '700 15px Sans, Arial, sans-serif';
            ctx.fillText(ln, x + 20, y + 76 + idx * 28);
        });
    } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.beginPath();
        ctx.roundRect(x + 20, y + 62, w - 40, h - 82, 14);
        ctx.fill();
        ctx.fillStyle = applyTextGradient(ctx, x + 32, y + 84, x + w - 32, y + 120, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 20px Sans, Arial, sans-serif';
        ctx.fillText(detailText || 'KYURO ACTIVITY', x + 32, y + 104);
    }

    ctx.fillStyle = applyTextGradient(ctx, x + 20, y + 16, x + w - 20, y + 46, '#ffffff', '#e0f2fe', '#7dd3fc');
    ctx.font = '700 17px Sans, Arial, sans-serif';
    ctx.fillText(topCaption, x + 22, y + 34);
    ctx.restore();
}
async function createCleanBlueCard(w, h, badgeText, pseudoText, avatarUrl, drawBodyFn, filename) {
    if (!NapiCanvas) return new AttachmentBuilder(Buffer.from(''), { name: filename });
    const canvas = NapiCanvas.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const avatarImg = await loadAvatarImage(avatarUrl);
    drawBlueThemeFrame(ctx, w, h, badgeText, pseudoText);
    await drawBodyFn(ctx, avatarImg, w, h);
    return new AttachmentBuilder(await canvas.encode('png'), { name: filename });
}

function getHelpSection(tab = 'all') {
    if (tab === 'gamble') {
        return {
            title: 'Jeux & Casino',
            cmds: [
                '*bj <mise|all>',
                '*roulette <rouge|noir|vert|pair|impair> <mise>',
                '*slots <mise|all>',
                '*cf <pile|face> <mise>',
                '*dice <1-6> <mise>',
                '*crash <mise|all>',
                '*spin <mise|all>',
                '*scratch <mise|all>',
                '*duel <@membre> <mise>'
            ]
        };
    }
    if (tab === 'biz') {
        return {
            title: 'Monopoly, Crypto & Braquages',
            cmds: [
                '*monopoly / *monopoly shop',
                '*monopoly buy <id> / *monopoly collect',
                '*crypto <BTC|ETH|KYR|SOL>',
                '*crypto buy <sym> <qté>',
                '*crypto sell <sym> <qté>',
                '*heist / *hack / *rob',
                '*lb / *top'
            ]
        };
    }
    if (tab === 'owner') {
        return {
            title: 'Administration & Owner',
            cmds: [
                '*owner <id> / *unowner <id>',
                '*setcasino <ID|off>',
                '*setmoney <@membre> <montant>',
                '*reseteconomy',
                '*enchère <10s-24h> <mise> <titre>'
            ]
        };
    }
    return {
        title: 'Économie & Banque',
        cmds: [
            '*balance / *bal',
            '*deposit <montant|all>',
            '*withdraw <montant|all>',
            '*work / *daily / *crime',
            '*mine / *fish',
            '*pay <@membre> <montant>',
            '*gift <@membre> <montant>'
        ]
    };
}

async function renderHelpBluePng(tab = 'all') {
    const active = tab === 'all' ? 'eco' : tab;
    const sec = getHelpSection(active);
    const items = sec.cmds;
    const rows = Math.ceil(items.length / 2);
    const panelTop = 148;
    const rowStep = 48;
    const panelH = Math.max(220, rows * rowStep + 28);
    const totalH = Math.max(430, panelTop + panelH + 34);

    return createCleanBlueCard(980, totalH, `KYURO HELP • ${active.toUpperCase()}`, 'PRÉFIXE *', null, async (ctx) => {
        ctx.fillStyle = applyTextGradient(ctx, 34, 92, 920, 126, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(sec.title, 34, 114);

        ctx.beginPath();
        ctx.roundRect(34, panelTop, 912, panelH, 20);
        ctx.fillStyle = 'rgba(12, 36, 78, 0.95)';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
        ctx.stroke();

        items.forEach((line, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const bx = 52 + col * 442;
            const by = panelTop + 16 + row * rowStep;
            ctx.beginPath();
            ctx.roundRect(bx, by, 434, 38, 11);
            ctx.fillStyle = 'rgba(7, 22, 49, 0.94)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
            ctx.stroke();

            ctx.fillStyle = applyTextGradient(ctx, bx + 12, by + 8, bx + 422, by + 30, '#ffffff', '#bae6fd', '#38bdf8');
            ctx.font = '700 16px Sans, Arial, sans-serif';
            const trimmed = line.length > 42 ? `${line.slice(0, 41)}…` : line;
            ctx.fillText(trimmed, bx + 14, by + 24);
        });
    }, 'kyuro-help.png');
}
function helpButtons(activeTab = 'eco') {
    const current = activeTab === 'all' ? 'eco' : activeTab;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_eco').setLabel('Économie').setStyle(current === 'eco' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_gamble').setLabel('Jeux').setStyle(current === 'gamble' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_biz').setLabel('Monopoly & Crypto').setStyle(current === 'biz' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_owner').setLabel('Owner').setStyle(current === 'owner' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
}

function buildContainerV2({ title, body, footer }) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer || 'Kyuro Casino • Préfixe *'}`));
}

async function replyImageOnly(message, attachment, components = []) {
    return message.reply({ files: [attachment], components, allowedMentions: { parse: [] } });
}

async function replyContainer(message, { title, body, footer, components = [] }) {
    return message.reply({ flags: MessageFlags.IsComponentsV2, components: [buildContainerV2({ title, body, footer }), ...components], allowedMentions: { parse: [] } });
}

async function renderWalletBluePng(userObj, extra = '') {
    return createCleanBlueCard(980, 440, 'KYURO BANK', userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 122, 34);
        ctx.fillStyle = applyTextGradient(ctx, 124, 92, 680, 126, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText('PORTEFEUILLE & BANQUE', 124, 114);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 18px Sans, Arial, sans-serif';
        ctx.fillText(extra || 'Compte joueur actif', 124, 144);

        const total = (userObj.cash || 0) + (userObj.bank || 0);
        const boxes = [
            { title: 'CASH DISPONIBLE', val: `${Math.floor(userObj.cash || 0).toLocaleString('fr-FR')} $`, sub: 'Liquide en poche' },
            { title: 'COFFRE BANQUE', val: `${Math.floor(userObj.bank || 0).toLocaleString('fr-FR')} $`, sub: 'Épargne sécurisée' },
            { title: 'FORTUNE TOTALE', val: `${Math.floor(total).toLocaleString('fr-FR')} $`, sub: `V/D : ${userObj.stats?.wins || 0}/${userObj.stats?.losses || 0}` }
        ];
        boxes.forEach((b, i) => {
            const x = 34 + i * 308, y = 184;
            ctx.beginPath();
            ctx.roundRect(x, y, 292, 208, 20);
            ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
            ctx.stroke();
            ctx.fillStyle = '#7dd3fc';
            ctx.font = '700 16px Sans, Arial, sans-serif';
            ctx.fillText(b.title, x + 22, y + 38);
            ctx.fillStyle = applyTextGradient(ctx, x + 22, y + 84, x + 268, y + 124, '#ffffff', '#bae6fd', '#38bdf8');
            ctx.font = '700 32px Sans, Arial, sans-serif';
            ctx.fillText(b.val, x + 22, y + 108);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.8)';
            ctx.font = '600 15px Sans, Arial, sans-serif';
            ctx.fillText(b.sub, x + 22, y + 176);
        });
    }, 'kyuro-wallet.png');
}
async function renderMonopolyBluePng(userObj, pendingRent, residentsCount, maxResidentsCount) {
    return createCleanBlueCard(980, 440, 'KYURO MONOPOLY', userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 122, 34);
        const bCount = (userObj.buildings || []).length;
        ctx.fillStyle = applyTextGradient(ctx, 124, 96, 900, 128, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(`IMMEUBLES : ${bCount}  •  HABITANTS : ${residentsCount}/${maxResidentsCount}`, 124, 118);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 19px Sans, Arial, sans-serif';
        ctx.fillText(`LOYERS À RÉCOLTER : +${Math.floor(pendingRent).toLocaleString('fr-FR')} $`, 124, 148);

        ctx.beginPath();
        ctx.roundRect(34, 174, 912, 224, 20);
        ctx.fillStyle = 'rgba(7, 22, 49, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.58)';
        ctx.stroke();

        const baseY = 374;
        ctx.fillStyle = '#7dd3fc';
        ctx.beginPath();
        ctx.roundRect(54, baseY, 872, 5, 3);
        ctx.fill();

        const visualCount = Math.min(6, Math.max(1, bCount || 1));
        const slotW = 840 / visualCount;
        for (let i = 0; i < visualCount; i++) {
            const bItem = userObj.buildings[i];
            const bw = Math.min(122, Math.floor(slotW * 0.72));
            const bx = Math.round(68 + i * slotW + (slotW - bw) / 2);
            const bh = Math.round(88 + ((i + (bItem ? bItem.tier : 1)) % 4) * 28);
            const by = baseY - bh;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 14);
            ctx.fillStyle = '#153f80';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7dd3fc';
            ctx.stroke();
        }
    }, 'kyuro-monopoly.png');
}

async function renderCryptoBluePng(userObj, symbol, name, price, history, userQty) {
    return createCleanBlueCard(980, 440, `KYURO CRYPTO • ${symbol}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 32);
        ctx.fillStyle = applyTextGradient(ctx, 120, 96, 860, 128, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`${name} — ${price.toLocaleString('fr-FR')} $`, 120, 118);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 18px Sans, Arial, sans-serif';
        ctx.fillText(`PORTEFEUILLE : ${userQty} ${symbol}  •  VALEUR : ${Math.floor((userQty || 0) * price).toLocaleString('fr-FR')} $`, 120, 146);

        const gx = 34, gy = 172, gw = 912, gh = 224;
        ctx.beginPath();
        ctx.roundRect(gx, gy, gw, gh, 20);
        ctx.fillStyle = 'rgba(7, 20, 44, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
        ctx.stroke();

        const vals = history.length > 1 ? history : [price, price];
        const minV = Math.min(...vals), maxV = Math.max(...vals), span = Math.max(1, maxV - minV);
        const pts = vals.map((v, i) => ({
            x: gx + 32 + (i / (vals.length - 1)) * (gw - 64),
            y: gy + gh - 34 - ((v - minV) / span) * (gh - 68)
        }));
        ctx.beginPath();
        pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = applyTextGradient(ctx, gx, gy + gh, gx + gw, gy, '#38bdf8', '#7dd3fc', '#ffffff');
        ctx.lineWidth = 4;
        ctx.stroke();
    }, 'kyuro-crypto.png');
}
async function renderSlotsBluePng(userObj, reels, bet, statusText) {
    return createCleanBlueCard(980, 440, 'KYURO SLOTS', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 116, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 96, 900, 128, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 122);

        const cabX = 34, cabY = 160, cabW = 866, cabH = 242;
        ctx.beginPath();
        ctx.roundRect(cabX, cabY, cabW, cabH, 22);
        ctx.fillStyle = '#0c2752';
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#7dd3fc';
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(cabX + cabW + 12, cabY + 56, 14, 126, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cabX + cabW + 19, cabY + 48, 17, 0, Math.PI * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();

        const labels = { '💎': 'GEM', '💠': 'KYR', '🪙': 'USD', '⚡': 'VOLT', '🔥': 'FIRE' };
        reels.forEach((sym, i) => {
            const rx = cabX + 26 + i * 276, ry = cabY + 26, rw = 258, rh = 190;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 16);
            ctx.fillStyle = '#133a78';
            ctx.fill();
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.75)';
            ctx.stroke();

            ctx.fillStyle = applyTextGradient(ctx, rx, ry, rx + rw, ry + rh, '#ffffff', '#e0f2fe', '#38bdf8');
            ctx.font = '700 40px Sans, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[sym] || 'WIN', rx + rw / 2, ry + rh / 2 + 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        });
    }, 'kyuro-slots.png');
}

async function renderDiceBluePng(userObj, roll, guess, bet, statusText) {
    return createCleanBlueCard(980, 430, 'KYURO DICE', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 900, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 126);

        drawDieFace(ctx, 50, 174, 180, roll);
        drawDieFace(ctx, 254, 174, 180, guess);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 16px Sans, Arial, sans-serif';
        ctx.fillText('RÉSULTAT DÉ', 50, 378);
        ctx.fillText('TON CHOIX', 254, 378);

        ctx.beginPath();
        ctx.roundRect(458, 174, 488, 180, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
        ctx.stroke();
        ctx.fillStyle = applyTextGradient(ctx, 484, 240, 920, 290, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 484, 272);
    }, 'kyuro-dice.png');
}

async function renderCrashBluePng(userObj, crashAt, targetMult, bet, statusText) {
    return createCleanBlueCard(980, 430, 'KYURO CRASH', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 900, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 26px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 126);

        const gx = 36, gy = 170, gw = 564, gh = 204;
        ctx.beginPath();
        ctx.roundRect(gx, gy, gw, gh, 20);
        ctx.fillStyle = 'rgba(7, 20, 44, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();

        const curvePts = [{ x: gx + 28, y: gy + gh - 28 }, { x: gx + 180, y: gy + gh - 56 }, { x: gx + 350, y: gy + gh - 104 }, { x: gx + gw - 34, y: gy + 34 }];
        ctx.beginPath();
        curvePts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = applyTextGradient(ctx, gx, gy + gh, gx + gw, gy, '#38bdf8', '#7dd3fc', '#ffffff');
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(622, 170, 324, 204, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 18px Sans, Arial, sans-serif';
        ctx.fillText(`CIBLE : X${targetMult}  •  CRASH : X${crashAt}`, 646, 224);
        ctx.fillStyle = applyTextGradient(ctx, 646, 274, 924, 316, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 24px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 646, 296);
    }, 'kyuro-crash.png');
}

async function renderCoinflipBluePng(userObj, side, out, bet, statusText) {
    return createCleanBlueCard(980, 420, 'KYURO COINFLIP', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 900, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 126);

        ctx.beginPath();
        ctx.arc(152, 260, 82, 0, Math.PI * 2);
        ctx.fillStyle = '#143d7d';
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#bae6fd';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(out.toUpperCase(), 152, 262);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.beginPath();
        ctx.roundRect(264, 178, 682, 166, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();
        ctx.fillStyle = applyTextGradient(ctx, 292, 248, 920, 292, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`${side.toUpperCase()} -> ${statusText}`, 292, 274);
    }, 'kyuro-coinflip.png');
}
async function renderFishOrMineBluePng(userObj, mode, itemLabel, gain) {
    const isFish = mode === 'FISH';
    return createCleanBlueCard(980, 420, `KYURO ${mode}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 900, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`${isFish ? 'PRISE' : 'FILON'} : ${itemLabel}`, 118, 126);

        drawRealisticScenePanel(ctx, mode, 36, 174, 444, 184, isFish ? 'ZONE DE PÊCHE' : 'FILON SOUTERRAIN', itemLabel);

        ctx.beginPath();
        ctx.roundRect(500, 174, 446, 184, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
        ctx.stroke();
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 17px Sans, Arial, sans-serif';
        ctx.fillText(isFish ? 'RÉCOMPENSE RÉCOLTÉE' : 'MINERAI EXTRAIT', 528, 214);
        ctx.fillStyle = applyTextGradient(ctx, 528, 262, 920, 308, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 32px Sans, Arial, sans-serif';
        ctx.fillText(`GAIN : +${gain.toLocaleString('fr-FR')} $`, 528, 286);
        ctx.fillStyle = '#bae6fd';
        ctx.font = '600 16px Sans, Arial, sans-serif';
        ctx.fillText(`CASH ACTUEL : ${(userObj.cash || 0).toLocaleString('fr-FR')} $`, 528, 326);
    }, isFish ? 'kyuro-fish.png' : 'kyuro-mine.png');
}

async function renderBlueActionPng(userObj, badge, headline, subline) {
    return createCleanBlueCard(980, 400, `KYURO • ${badge}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 74, 128, 34);
        ctx.fillStyle = applyTextGradient(ctx, 126, 108, 920, 140, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 29px Sans, Arial, sans-serif';
        ctx.fillText(headline, 126, 132);

        drawRealisticScenePanel(ctx, badge, 36, 180, 344, 166, `OPÉRATION ${badge}`, subline);

        ctx.beginPath();
        ctx.roundRect(398, 180, 548, 166, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
        ctx.stroke();
        ctx.fillStyle = applyTextGradient(ctx, 426, 248, 920, 294, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(subline, 426, 272);
    }, 'kyuro-action.png');
}

async function renderLeaderboardBluePng(entries) {
    return createCleanBlueCard(980, 460, 'KYURO TOP', 'CLASSEMENT FORTUNES ($)', null, async (ctx) => {
        ctx.fillStyle = applyTextGradient(ctx, 36, 94, 680, 126, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText('TOP JOUEURS DU SERVEUR', 36, 116);
        const top = entries.slice(0, 5);
        const maxVal = Math.max(1, top[0]?.total || 1);
        top.forEach((e, idx) => {
            const y = 148 + idx * 54;
            ctx.beginPath();
            ctx.roundRect(36, y, 908, 44, 14);
            ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
            ctx.fill();
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '700 20px Sans, Arial, sans-serif';
            ctx.fillText(`#${idx + 1}  ${e.name}`, 54, y + 29);
            const ratio = Math.max(0.06, Math.min(1, e.total / maxVal));
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.roundRect(440, y + 16, Math.round(250 * ratio), 12, 6);
            ctx.fill();
            ctx.fillStyle = applyTextGradient(ctx, 730, y + 10, 926, y + 36, '#ffffff', '#bae6fd', '#38bdf8');
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(e.total).toLocaleString('fr-FR')} $`, 926, y + 29);
            ctx.textAlign = 'left';
        });
    }, 'kyuro-leaderboard.png');
}
async function renderRouletteBluePng(userObj, num, color, choiceLabel, bet, statusText) {
    return createCleanBlueCard(980, 440, 'KYURO ROULETTE', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 118, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 96, 920, 128, '#ffffff', '#bae6fd', '#7dd3fc');
        ctx.font = '700 26px Sans, Arial, sans-serif';
        ctx.fillText(`CHIFFRE : ${num} (${color.toUpperCase()})  •  TON CHOIX : ${choiceLabel.toUpperCase()}`, 118, 124);

        const wheelCx = 166, wheelCy = 268, rOuter = 96, rInner = 54;
        const segments = 12;
        const palette = ['#dc2626', '#0f172a', '#dc2626', '#0f172a', '#16a34a', '#0f172a', '#dc2626', '#0f172a', '#dc2626', '#0f172a', '#dc2626', '#0f172a'];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(wheelCx, wheelCy);
            ctx.arc(wheelCx, wheelCy, rOuter, a0, a1);
            ctx.closePath();
            ctx.fillStyle = palette[i];
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(wheelCx, wheelCy, rInner, 0, Math.PI * 2);
        ctx.fillStyle = '#071f45';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#7dd3fc';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 34px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${num}`, wheelCx, wheelCy + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.beginPath();
        ctx.roundRect(292, 172, 654, 192, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 17px Sans, Arial, sans-serif';
        ctx.fillText(`COULEUR SORTIE : ${color.toUpperCase()}  •  PARI : ${choiceLabel.toUpperCase()}`, 320, 214);
        ctx.fillStyle = applyTextGradient(ctx, 320, 262, 920, 306, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 320, 286);
        ctx.fillStyle = '#bae6fd';
        ctx.font = '600 17px Sans, Arial, sans-serif';
        ctx.fillText(`CASH ACTUEL : ${(userObj.cash || 0).toLocaleString('fr-FR')} $`, 320, 330);
    }, 'kyuro-roulette.png');
}
async function renderBlackjackBluePng(userObj, bet, pCards, pVal, dCards, dVal, statusText) {
    const suitSym = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const isRedSuit = (c) => ['H', 'D'].includes(c.slice(-1));
    return createCleanBlueCard(980, 440, 'KYURO BLACKJACK', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 116, 28);
        ctx.fillStyle = applyTextGradient(ctx, 114, 100, 900, 130, '#ffffff', '#bae6fd', '#7dd3fc');
        ctx.font = '700 24px Sans, Arial, sans-serif';
        ctx.fillText(`TA MAIN (${pVal})`, 114, 124);
        ctx.fillText(`CROUPIER (${dVal})`, 536, 124);

        const drawCardBox = (card, cx, cy) => {
            const hidden = card === '??';
            const red = !hidden && isRedSuit(card);
            ctx.beginPath();
            ctx.roundRect(cx, cy, 80, 122, 14);
            ctx.fillStyle = hidden ? '#0b244d' : '#f8fafc';
            ctx.fill();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = hidden ? '#38bdf8' : (red ? '#ef4444' : '#0284c7');
            ctx.stroke();

            if (hidden) {
                ctx.fillStyle = '#7dd3fc';
                ctx.font = '700 24px Sans, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('?', cx + 40, cy + 68);
                ctx.textAlign = 'left';
                return;
            }
            const rank = card.slice(0, -1);
            const sym = suitSym[card.slice(-1)] || '♠';
            ctx.fillStyle = red ? '#dc2626' : '#0f172a';
            ctx.font = '700 20px Sans, Arial, sans-serif';
            ctx.fillText(rank, cx + 10, cy + 26);
            ctx.font = '700 28px Sans, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sym, cx + 40, cy + 72);
            ctx.font = '700 18px Sans, Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(rank, cx + 70, cy + 110);
            ctx.textAlign = 'left';
        };

        pCards.slice(0, 5).forEach((card, i) => drawCardBox(card, 36 + i * 92, 150));
        dCards.slice(0, 4).forEach((card, i) => drawCardBox(card, 536 + i * 92, 150));

        ctx.beginPath();
        ctx.roundRect(36, 306, 910, 74, 18);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.95)';
        ctx.fill();
        ctx.fillStyle = applyTextGradient(ctx, 60, 330, 920, 362, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 25px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 60, 352);
    }, 'kyuro-blackjack.png');
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const u = getUser(target.id, target);
    return replyImageOnly(message, await renderWalletBluePng(u, u.buildings.length > 0 ? `IMMEUBLES : ${u.buildings.length}` : 'AUCUN IMMEUBLE'));
}

async function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author), amt = parseAmount(args[0], u.cash);
    if (!amt || u.cash < amt) return replyContainer(message, { title: '🏦 Dépôt', body: 'Utilisation : `*deposit <montant|all>`' });
    u.cash -= amt; u.bank += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `DÉPÔT : +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author), amt = parseAmount(args[0], u.bank);
    if (!amt || u.bank < amt) return replyContainer(message, { title: '🏧 Retrait', body: 'Utilisation : `*withdraw <montant|all>`' });
    u.bank -= amt; u.cash += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `RETRAIT : +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 45 * 60 * 1000;
    if (now - u.cooldowns.work < cd) return replyContainer(message, { title: '💼 Travail', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    u.cooldowns.work = now; const gain = randInt(45, 190); u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'WORK', `SALAIRE : +${gain.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) return replyContainer(message, { title: '🎁 Daily', body: `Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    u.cooldowns.daily = now; const gain = randInt(150, 480); u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'DAILY', `BONUS : +${gain.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleCrime(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) return replyContainer(message, { title: '🕵️ Crime', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    u.cooldowns.crime = now; const ok = Math.random() < 0.38;
    const amt = ok ? randInt(90, 340) : Math.min(u.cash, randInt(80, 260));
    if (ok) u.cash += amt; else u.cash -= amt; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'CRIME', ok ? `COUP RÉUSSI +${amt.toLocaleString('fr-FR')} $` : `AMENDE -${amt.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleMine(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 25 * 60 * 1000;
    if (now - u.cooldowns.mine < cd) return replyContainer(message, { title: '⛏️ Mine', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.mine))}**.` });
    u.cooldowns.mine = now; const ores = ['FER', 'CUIVRE', 'OR', 'DIAMANT', 'CRISTAL KYR'], ore = ores[randInt(0, ores.length - 1)], gain = randInt(35, 220);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderFishOrMineBluePng(u, 'MINE', ore, gain));
}

async function handleFish(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 25 * 60 * 1000;
    if (now - u.cooldowns.fish < cd) return replyContainer(message, { title: '🎣 Pêche', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.fish))}**.` });
    u.cooldowns.fish = now; const catches = ['GARDON', 'BROCHET', 'CARPE', 'COFFRE BLEU', 'PERLE'], item = catches[randInt(0, catches.length - 1)], gain = randInt(30, 195);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderFishOrMineBluePng(u, 'FISH', item, gain));
}
function getBuildingStats(ownerObj) {
    const list = Array.isArray(ownerObj.buildings) ? ownerObj.buildings : [];
    return { maxRes: list.reduce((a, b) => a + (b.maxResidents || 0), 0), residentsTotal: list.reduce((a, b) => a + (b.residents || 0), 0) };
}

function computePendingRent(ownerObj) {
    const list = Array.isArray(ownerObj.buildings) ? ownerObj.buildings : [], now = Date.now();
    return list.reduce((sum, b) => sum + Math.floor(Math.min(24, Math.max(0, (now - (b.lastCollect || now)) / 3600000)) * (b.residents || 0) * (b.rentPerResident || 65)), 0);
}

async function handleMonopoly(message, args) {
    const u = getUser(message.author.id, message.author), sub = (args[0] || 'info').toLowerCase();
    if (sub === 'shop' || sub === 'list') {
        const lines = Object.values(BUILDINGS_CATALOG).map((b) => `• **${b.name}** (\`${b.id}\`) — **${formatMoney(b.price)}** • **${formatMoney(b.rentPerResident)}/h**`);
        return replyContainer(message, { title: '🏙️ Kyuro Monopoly', body: lines.join('\n') });
    }
    if (sub === 'buy') {
        const tpl = BUILDINGS_CATALOG[(args[1] || '').toLowerCase()];
        if (!tpl || u.cash < tpl.price) return replyContainer(message, { title: '🏙️ Monopoly', body: 'Bien invalide ou cash insuffisant.' });
        u.cash -= tpl.price; u.buildings.push({ id: tpl.id, name: tpl.name, tier: tpl.tier, rentPerResident: tpl.rentPerResident, maxResidents: tpl.maxResidents, residents: 1, lastCollect: Date.now() }); saveData();
    }
    if (sub === 'collect' || sub === 'loyer') {
        const pending = computePendingRent(u), now = Date.now();
        for (const b of u.buildings) b.lastCollect = now; u.cash += pending; saveData();
    }
    const st = getBuildingStats(u);
    return replyImageOnly(message, await renderMonopolyBluePng(u, computePendingRent(u), st.residentsTotal, st.maxRes));
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id, message.author), sub = (args[0] || 'KYR').toLowerCase();
    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase(), amt = parseFloat(args[2]), c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0) return replyContainer(message, { title: '📈 Crypto', body: 'Utilisation : `*crypto buy <BTC|ETH|KYR|SOL> <qté>`' });
        const cost = Math.ceil(amt * c.price); if (u.cash < cost) return replyContainer(message, { title: '📈 Crypto', body: `Il faut **${formatMoney(cost)}**.` });
        u.cash -= cost; u.crypto[sym] = (u.crypto[sym] || 0) + amt; saveData();
        return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym]));
    }
    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase(), amt = parseFloat(args[2]), c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0 || (u.crypto[sym] || 0) < amt) return replyContainer(message, { title: '📉 Crypto', body: 'Utilisation : `*crypto sell <BTC|ETH|KYR|SOL> <qté>`' });
        const gain = Math.floor(amt * c.price); u.crypto[sym] -= amt; u.cash += gain; saveData();
        return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym]));
    }
    const sym = db.cryptos[sub.toUpperCase()] ? sub.toUpperCase() : 'KYR', c = db.cryptos[sym];
    return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym] || 0));
}

async function handleGift(message, args) {
    const s = getUser(message.author.id, message.author), t = message.mentions.users.first(), amt = parseAmount(args[1], s.cash);
    if (!t || t.bot || t.id === message.author.id || !amt || s.cash < amt) return replyContainer(message, { title: '🎁 Gift', body: 'Utilisation : `*gift <@membre> <montant|all>`' });
    const r = getUser(t.id, t); s.cash -= amt; r.cash += amt; saveData();
    return replyImageOnly(message, await renderBlueActionPng(s, 'GIFT', `DON : -${amt.toLocaleString('fr-FR')} $`, `POUR : ${r.username}`));
}

async function handleRob(message) {
    const u = getUser(message.author.id, message.author), target = message.mentions.users.first(), now = Date.now(), cd = 30 * 60 * 1000;
    if (!target || target.bot || target.id === message.author.id) return replyContainer(message, { title: '🥷 Rob', body: 'Mentionne un membre : `*rob <@membre>`' });
    if (now - u.cooldowns.rob < cd) return replyContainer(message, { title: '🥷 Rob', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.rob))}**.` });
    const tu = getUser(target.id, target); u.cooldowns.rob = now;
    if ((tu.cash || 0) < 25) return replyContainer(message, { title: '🥷 Rob', body: `**${tu.username}** n'a pas assez de cash.` });
    const ok = Math.random() < 0.42, amt = Math.min(tu.cash, Math.max(20, Math.floor(tu.cash * randInt(10, 28) / 100)));
    if (ok) { tu.cash -= amt; u.cash += amt; } else { const fine = Math.min(u.cash, amt); u.cash -= fine; } saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'ROB', ok ? `VOLÉ : +${amt.toLocaleString('fr-FR')} $` : 'RATÉ / AMENDE', `CIBLE : ${tu.username}`));
}

async function handleHack(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 35 * 60 * 1000;
    if (now - u.cooldowns.hack < cd) return replyContainer(message, { title: '💻 Hack', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.hack))}**.` });
    u.cooldowns.hack = now; const ok = Math.random() < 0.45, gain = ok ? randInt(110, 420) : 0;
    if (ok) { u.cash += gain; u.stats.hacksSuccess += 1; } saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'HACK', ok ? `FAILLE : +${gain.toLocaleString('fr-FR')} $` : 'ACCÈS BLOQUÉ', `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleHeist(message) {
    const u = getUser(message.author.id, message.author), now = Date.now(), cd = 60 * 60 * 1000;
    if (now - u.cooldowns.heist < cd) return replyContainer(message, { title: '🏦 Heist', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.heist))}**.` });
    u.cooldowns.heist = now; const ok = Math.random() < 0.36, amt = ok ? randInt(220, 780) : Math.min(u.cash, randInt(100, 350));
    if (ok) u.cash += amt; else u.cash -= amt; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'HEIST', ok ? `BRAQUAGE : +${amt.toLocaleString('fr-FR')} $` : `ALARME : -${amt.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}
function formatAuctionRemaining(auc) {
    if (auc.ended) return 'Terminée';
    const rem = Math.max(0, auc.endsAt - Date.now());
    return formatCooldown(rem);
}

function buildAuctionContainer(auc) {
    const minNext = auc.highestBidderId ? (auc.highestBid + 1) : auc.startBid;
    const histLines = (auc.history || []).slice(-4).map((h) => `• **${h.name}** — **${formatMoney(h.amount)}**`);
    const body = [
        `• **Mise de départ (min)** : **${formatMoney(auc.startBid)}**`,
        `• **Enchère actuelle** : **${formatMoney(auc.highestBid)}**`,
        `• **Meilleur offrant** : **${auc.highestBidderName}**`,
        `• **Enchère minimum suivante** : **${formatMoney(minNext)}**`,
        `• **Temps restant** : **${formatAuctionRemaining(auc)}**`,
        histLines.length ? `\n**Dernières offres :**\n${histLines.join('\n')}` : ''
    ].filter(Boolean).join('\n');

    return buildContainerV2({
        title: `🔨 Enchère : ${auc.title}`,
        body,
        footer: auc.ended ? 'Enchère clôturée • Kyuro Casino' : 'Mise à jour en temps réel • Kyuro Casino'
    });
}

function auctionButtonRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('auction_bid').setLabel('Enchérir').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    );
}

async function finalizeAuction(auc, sentMessage) {
    if (auc.ended) return;
    auc.ended = true;
    if (auc.ticker) clearInterval(auc.ticker);
    if (auc.highestBidderId) {
        const w = getUser(auc.highestBidderId);
        if (w.cash >= auc.highestBid) {
            w.cash -= auc.highestBid;
            saveData();
        }
    }
    await sentMessage.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [buildAuctionContainer(auc), auctionButtonRow(true)]
    }).catch(() => {});
}

async function handleAuctionCreate(message, args) {
    if (!isBotOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé aux Owners.' });
    const durMs = parseDurationMs(args[0]);
    const startBid = parseAmount(args[1], 1e9);
    const title = args.slice(2).join(' ').trim();
    if (!durMs || !startBid || !title) {
        return replyContainer(message, { title: '🔨 Enchère', body: 'Utilisation : `*enchère <10s-24h> <mise_départ> <titre>`' });
    }
    const auc = {
        messageId: null,
        title,
        startBid,
        highestBid: startBid,
        highestBidderId: null,
        highestBidderName: 'Aucun',
        history: [],
        endsAt: Date.now() + durMs,
        ended: false,
        ticker: null
    };
    const sent = await message.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [buildAuctionContainer(auc), auctionButtonRow(false)]
    });
    auc.messageId = sent.id;
    activeAuctions.set(sent.id, auc);

    auc.ticker = setInterval(async () => {
        if (auc.ended || Date.now() >= auc.endsAt) {
            await finalizeAuction(auc, sent);
            return;
        }
        await sent.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [buildAuctionContainer(auc), auctionButtonRow(false)]
        }).catch(() => {});
    }, 5000);

    setTimeout(() => finalizeAuction(auc, sent), durMs);
}
async function handleScratch(message, args) {
    const u = getUser(message.author.id, message.author), bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎟️ Scratch', body: 'Mise invalide ou cash insuffisant (`*scratch <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const mults = [0, 0, 0, 0.35, 0.75, 1.2, 2.0, 3.2], m = mults[randInt(0, mults.length - 1)], gain = Math.floor(bet * m);
    if (gain > 0) { u.cash += gain; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'SCRATCH', `MULTIPLICATEUR X${m}`, gain > 0 ? `GAIN : +${gain.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleSpin(message, args) {
    const u = getUser(message.author.id, message.author), bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎡 Spin', body: 'Mise invalide ou cash insuffisant (`*spin <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const wheel = [0, 0, 0.4, 0.8, 1.25, 1.85, 3.0], m = wheel[randInt(0, wheel.length - 1)], gain = Math.floor(bet * m);
    if (gain > 0) { u.cash += gain; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'SPIN', `ROUE : X${m}`, gain > 0 ? `REÇU : +${gain.toLocaleString('fr-FR')} $` : `MISE PERDUE : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleDuel(message, args) {
    const p1 = getUser(message.author.id, message.author), t = message.mentions.users.first(), bet = parseAmount(args[1], p1.cash);
    if (!t || t.bot || t.id === message.author.id || !bet || p1.cash < bet) return replyContainer(message, { title: '⚔️ Duel', body: 'Utilisation : `*duel <@membre> <mise|all>`' });
    const p2 = getUser(t.id, t); if (p2.cash < bet) return replyContainer(message, { title: '⚔️ Duel', body: `**${p2.username}** n'a pas assez de cash.` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('duel_accept').setLabel('Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('duel_decline').setLabel('Refuser').setStyle(ButtonStyle.Danger));
    const sent = await replyContainer(message, { title: '⚔️ Défi en duel', body: `**${p1.username}** défie **${p2.username}** pour **${formatMoney(bet)}** !`, components: [row] });
    activeDuels.set(sent.id, { p1Id: message.author.id, p2Id: t.id, bet });
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id, message.author), bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎰 Slots', body: 'Mise invalide ou cash insuffisant (`*slots <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'], r = [0,1,2].map(() => syms[randInt(0, syms.length - 1)]);
    const mult = (r[0] === r[1] && r[1] === r[2]) ? (r[0] === '💎' ? 7 : 3.5) : ((r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? 1.15 : 0);
    const win = Math.floor(bet * mult); if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderSlotsBluePng(u, r, bet, win > 0 ? `GAIN : +${win.toLocaleString('fr-FR')} $` : `PERTE : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id, message.author), side = (args[0] || '').toLowerCase(), bet = parseAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet || u.cash < bet) return replyContainer(message, { title: '🪙 Coinflip', body: 'Mise invalide ou cash insuffisant (`*coinflip <pile|face> <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const out = Math.random() < 0.5 ? 'pile' : 'face', won = out === side, payout = Math.floor(bet * 1.8);
    if (won) { u.cash += payout; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderCoinflipBluePng(u, side, out, bet, won ? `GAGNÉ : +${payout.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleDice(message, args) {
    const u = getUser(message.author.id, message.author), guess = parseInt(args[0], 10), bet = parseAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet || u.cash < bet) return replyContainer(message, { title: '🎲 Dice', body: 'Mise invalide ou cash insuffisant (`*dice <1-6> <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const roll = randInt(1, 6), won = roll === guess, payout = Math.floor(bet * 3.6);
    if (won) { u.cash += payout; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderDiceBluePng(u, roll, guess, bet, won ? `JACKPOT : +${payout.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id, message.author), bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🚀 Crash', body: 'Mise invalide ou cash insuffisant (`*crash <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.2).toFixed(2)), targetMult = Number((1.1 + Math.random() * 1.5).toFixed(2));
    const won = crashAt >= targetMult, pay = won ? Math.floor(bet * targetMult) : 0;
    if (won) { u.cash += pay; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderCrashBluePng(u, crashAt, targetMult, bet, won ? `ENCAISSÉ : +${pay.toLocaleString('fr-FR')} $` : `CRASH : -${bet.toLocaleString('fr-FR')} $`));
}

function drawCard() {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], suits = ['S', 'H', 'D', 'C'];
    return `${ranks[randInt(0, ranks.length - 1)]}${suits[randInt(0, suits.length - 1)]}`;
}

function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { const r = c.slice(0, -1); if (r === 'A') { total += 11; aces++; } else if (['K', 'Q', 'J'].includes(r)) total += 10; else total += parseInt(r, 10); }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

async function handleBlackjack(message, args) {
    const u = getUser(message.author.id, message.author), bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🃏 Blackjack', body: 'Mise invalide ou cash insuffisant (`*blackjack <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet; saveData();
    const pCards = [drawCard(), drawCard()], dCards = [drawCard(), drawCard()];
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary));
    const sent = await replyImageOnly(message, await renderBlackjackBluePng(u, bet, pCards, handValue(pCards), [dCards[0], '??'], '?', 'EN COURS'), [row]);
    activeBlackjacks.set(sent.id, { userId: message.author.id, bet, pCards, dCards });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id, message.author), ch = (args[0] || '').toLowerCase(), bet = parseAmount(args[1], u.cash);
    const valid = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];
    if (!valid.includes(ch) || !bet || u.cash < bet) return replyContainer(message, { title: '🎡 Roulette', body: 'Mise invalide ou cash insuffisant (`*roulette <rouge|noir|vert|pair|impair> <mise|all>`).' });
    u.cash -= bet; u.stats.wagered += bet;
    const num = randInt(0, 36), reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir'), parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');
    const norm = ['rouge','red'].includes(ch) ? 'rouge' : ['noir','black'].includes(ch) ? 'noir' : ['vert','green'].includes(ch) ? 'vert' : ['pair','even'].includes(ch) ? 'pair' : 'impair';
    const win = Math.floor(bet * ((norm === 'vert' && color === 'vert') ? 12 : ((norm === color || norm === parity) ? 1.75 : 0)));
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; } saveData();
    return replyImageOnly(message, await renderRouletteBluePng(u, num, color, norm, bet, win > 0 ? `GAGNÉ : +${win.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}
client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('auction_modal_')) {
        const auc = activeAuctions.get(interaction.customId.replace('auction_modal_', ''));
        if (!auc || auc.ended || Date.now() >= auc.endsAt) {
            return interaction.reply({ content: 'Cette enchère est terminée.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const u = getUser(interaction.user.id, interaction.user);
        const minAllowed = auc.highestBidderId ? (auc.highestBid + 1) : auc.startBid;
        const bid = parseAmount(interaction.fields.getTextInputValue('bid_amount').trim(), u.cash);
        if (!bid || bid < minAllowed) {
            return interaction.reply({ content: `Tu ne peux pas enchérir en dessous de **${formatMoney(minAllowed)}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        if (u.cash < bid) {
            return interaction.reply({ content: `Tu n'as pas assez de cash (**${formatMoney(u.cash)}**).`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        auc.highestBid = bid;
        auc.highestBidderId = interaction.user.id;
        auc.highestBidderName = u.username;
        auc.history.push({ name: u.username, amount: bid });
        await interaction.message.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [buildAuctionContainer(auc), auctionButtonRow(false)]
        }).catch(() => {});
        return interaction.reply({ content: `Offre acceptée : **${formatMoney(bid)}** sur **${auc.title}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    if (!interaction.isButton()) return;
    if (interaction.customId === 'auction_bid') {
        const auc = activeAuctions.get(interaction.message.id);
        if (!auc || auc.ended || Date.now() >= auc.endsAt) {
            return interaction.reply({ content: 'Cette enchère est terminée.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const minAllowed = auc.highestBidderId ? (auc.highestBid + 1) : auc.startBid;
        const modal = new ModalBuilder().setCustomId(`auction_modal_${interaction.message.id}`).setTitle(`Enchérir • ${auc.title.slice(0, 32)}`);
        const input = new TextInputBuilder()
            .setCustomId('bid_amount')
            .setLabel(`Minimum : ${minAllowed} $ (actuel : ${auc.highestBid} $)`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`${minAllowed}`)
            .setRequired(true);
        return interaction.showModal(modal.addComponents(new ActionRowBuilder().addComponents(input))).catch(() => {});
    }
    if (interaction.customId.startsWith('help_')) {
        const tab = interaction.customId.replace('help_', '');
        return interaction.update({ files: [await renderHelpBluePng(tab)], components: [helpButtons(tab)] }).catch(() => {});
    }
    const duel = activeDuels.get(interaction.message.id);
    if (duel) {
        if (interaction.user.id !== duel.p2Id) return;
        activeDuels.delete(interaction.message.id);
        const p1 = getUser(duel.p1Id), p2 = getUser(duel.p2Id, interaction.user);
        if (interaction.customId === 'duel_decline') return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [buildContainerV2({ title: '⚔️ Duel refusé', body: `**${p2.username}** a décliné.` })] }).catch(() => {});
        if (p1.cash < duel.bet || p2.cash < duel.bet) return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [buildContainerV2({ title: '⚔️ Duel annulé', body: 'Solde insuffisant.' })] }).catch(() => {});
        const p1Wins = Math.random() < 0.5, winAmt = Math.floor(duel.bet * 0.9);
        if (p1Wins) { p1.cash += winAmt; p2.cash -= duel.bet; p1.stats.wins += 1; p2.stats.losses += 1; } else { p2.cash += winAmt; p1.cash -= duel.bet; p2.stats.wins += 1; p1.stats.losses += 1; }
        saveData();
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [buildContainerV2({ title: '⚔️ Résultat du duel', body: `Victoire de **${(p1Wins ? p1 : p2).username}** (+**${formatMoney(winAmt)}**) !` })] }).catch(() => {});
    }
    const game = activeBlackjacks.get(interaction.message.id);
    if (!game || interaction.user.id !== game.userId) return;
    const u = getUser(game.userId, interaction.user); let finished = false, status = 'EN COURS';
    if (interaction.customId === 'bj_hit') { game.pCards.push(drawCard()); const pv = handValue(game.pCards); if (pv > 21) { finished = true; u.stats.losses += 1; status = `BUST (${pv}) -${game.bet} $`; } }
    else if (interaction.customId === 'bj_stand') { finished = true; while (handValue(game.dCards) < 17) game.dCards.push(drawCard()); const pv = handValue(game.pCards), dv = handValue(game.dCards); if (dv > 21 || pv > dv) { const pay = Math.floor(game.bet * 1.8); u.cash += pay; u.stats.wins += 1; status = `WIN ${pv} VS ${dv} +${pay} $`; } else if (pv === dv) { u.cash += game.bet; status = `ÉGALITÉ ${pv} VS ${dv}`; } else { u.stats.losses += 1; status = `PERDU ${pv} VS ${dv} -${game.bet} $`; } }
    saveData(); if (finished) activeBlackjacks.delete(interaction.message.id);
    await interaction.update({ files: [await renderBlackjackBluePng(u, game.bet, game.pCards, handValue(game.pCards), finished ? game.dCards : [game.dCards[0], '??'], finished ? handValue(game.dCards) : '?', status)], components: finished ? [] : interaction.message.components }).catch(() => {});
});
client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = (args.shift() || '').toLowerCase();
    if (cmd === 'setcasino' || cmd === 'casinochannel') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé au Super Owner.' });
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'off' || sub === 'reset' || sub === 'clear') { setGuildCasinoCategory(message.guild.id, null); return replyContainer(message, { title: '🔓 Restriction désactivée', body: 'Kyuro Casino fonctionne dans tous les salons.' }); }
        const categoryId = await resolveCategoryIdFromInput(message, args[0]);
        if (!categoryId) return replyContainer(message, { title: '❌ Catégorie introuvable', body: 'Indique un ID de catégorie (`*setcasino <ID>`).' });
        const catChannel = await message.guild.channels.fetch(categoryId).catch(() => null);
        setGuildCasinoCategory(message.guild.id, categoryId);
        return replyContainer(message, { title: '🎰 Catégorie configurée', body: `Salon/catégorie actif : **${catChannel ? catChannel.name : categoryId}**.` });
    }
    if (cmd === 'owner' || cmd === 'unowner') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Seul le Super Owner peut gérer les owners.' });
        const targetId = (message.mentions.users.first()?.id || args[0] || '').replace(/[<@!>]/g, '').trim();
        if (!targetId) return replyContainer(message, { title: '👑 Owners', body: `Utilisation : \`*${cmd} <id>\`` });
        if (!Array.isArray(db.owners)) db.owners = [];
        if (cmd === 'owner') { if (!db.owners.includes(targetId)) { db.owners.push(targetId); saveData(); } return replyContainer(message, { title: '👑 Owner ajouté', body: `**${targetId}** est désormais Owner.` }); }
        db.owners = db.owners.filter((id) => id !== targetId); saveData();
        return replyContainer(message, { title: '👑 Owner retiré', body: `**${targetId}** n'est plus Owner.` });
    }
    if (!isAllowedCasinoChannel(message)) return;
    getUser(message.author.id, message.author);
    if (cmd === 'enchère' || cmd === 'enchere') return handleAuctionCreate(message, args);
    if (cmd === 'reseteconomy') { if (!isBotOwner(message.author)) return; db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)), casinoCategories: db.casinoCategories || {}, owners: db.owners || [] }; saveData(); return replyContainer(message, { title: '♻️ Reset OK', body: 'Économie remise à **0 $**.' }); }
    if (cmd === 'setmoney') { if (!isBotOwner(message.author)) return; const t = message.mentions.users.first(), amt = parseAmount(args[1], 1e9); if (!t || !amt) return; const tu = getUser(t.id, t); tu.cash = amt; saveData(); return replyContainer(message, { title: '💰 Setmoney', body: `Cash de **${tu.username}** : **${formatMoney(amt)}**.` }); }
    if (cmd === 'help') return replyImageOnly(message, await renderHelpBluePng('eco'), [helpButtons('eco')]);
    if (cmd === 'balance' || cmd === 'bal') return handleBalance(message);
    if (cmd === 'deposit' || cmd === 'dep') return handleDeposit(message, args);
    if (cmd === 'withdraw' || cmd === 'with') return handleWithdraw(message, args);
    if (cmd === 'work') return handleWork(message);
    if (cmd === 'daily') return handleDaily(message);
    if (cmd === 'crime') return handleCrime(message);
    if (cmd === 'mine') return handleMine(message);
    if (cmd === 'fish') return handleFish(message);
    if (cmd === 'gift') return handleGift(message, args);
    if (cmd === 'rob') return handleRob(message);
    if (cmd === 'hack') return handleHack(message);
    if (cmd === 'heist') return handleHeist(message);
    if (cmd === 'scratch') return handleScratch(message, args);
    if (cmd === 'spin') return handleSpin(message, args);
    if (cmd === 'duel') return handleDuel(message, args);
    if (cmd === 'monopoly' || cmd === 'immo') return handleMonopoly(message, args);
    if (cmd === 'crypto' || cmd === 'bourse') return handleCrypto(message, args);
    if (cmd === 'blackjack' || cmd === 'bj') return handleBlackjack(message, args);
    if (cmd === 'roulette' || cmd === 'rl') return handleRoulette(message, args);
    if (cmd === 'slots' || cmd === 'slot') return handleSlots(message, args);
    if (cmd === 'coinflip' || cmd === 'cf') return handleCoinflip(message, args);
    if (cmd === 'dice') return handleDice(message, args);
    if (cmd === 'crash') return handleCrash(message, args);
    if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') { const entries = Object.entries(db.users).map(([id, usr]) => ({ name: usr.username || `Joueur_${id.slice(-4)}`, total: (usr.cash || 0) + (usr.bank || 0) })).sort((a, b) => b.total - a.total); return replyImageOnly(message, await renderLeaderboardBluePng(entries)); }
});
setInterval(() => { for (const sym of Object.keys(db.cryptos)) { const c = db.cryptos[sym], delta = 1 + ((Math.random() - 0.5) * 0.09); c.price = Math.max(10, Math.round(c.price * delta)); c.history = [...(c.history || []).slice(-11), c.price]; } saveData(); }, 600000);
client.on('error', err => console.error('Erreur client Discord:', err.message));
client.on('shardError', err => console.error('Erreur shard Discord:', err.message));
client.on('shardDisconnect', (event, id) => { console.warn(`Shard ${id} déconnecté. Reconnexion...`); if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Reconnexion:', e.message)); });
setInterval(() => { if (!client.isReady() && process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Relance:', e.message)); }, 240000);
process.on('unhandledRejection', reason => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
client.once('clientReady', () => console.log(`Kyuro Casino v9.0 prêt : ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
