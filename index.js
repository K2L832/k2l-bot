const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const http = require('http');

// Serveur HTTP pour Render (garde le web service actif)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Operational!\n');
}).listen(PORT, () => console.log(`Serveur HTTP actif sur le port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const PREFIX = '=';

// Stockages en mémoire
const snipeCache = new Map();
const spamTracker = new Map();
const serverConfig = new Map(); 
const botOwners = new Set(); // Liste des IDs des Owners du bot

// Fonction de vérification Owner (le propriétaire du serveur est d'office owner)
function isOwner(message) {
    if (message.author.id === message.guild.ownerId) return true;
    if (botOwners.has(message.author.id)) return true;
    return false;
}

// Cache Snipe
client.on('messageDelete', message => {
    if (!message.author || message.author.bot) return;
    snipeCache.set(message.channel.id, {
        content: message.content || "[Média / Embed]",
        author: message.author.tag,
        avatar: message.author.displayAvatarURL(),
        time: new Date().toLocaleTimeString()
    });
});

// ==========================================
// AUTOMOD : Anti-Link, Anti-Spam & Anti-Bot
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || isOwner(message);

    // 1. Anti-Link / Anti-Leak
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
    if (linkRegex.test(message.content) && !isUserAdminOrOwner) {
        try {
            await message.delete();
            const warning = await message.channel.send(`⚠️ ${message.author}, les liens et invitations ne sont pas autorisés.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return;
        } catch (e) {}
    }

    // 2. Anti-Spam (Max 5 messages en 5 secondes)
    const userId = message.author.id;
    if (!isUserAdminOrOwner) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < 5000);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length > 5) {
            try {
                await message.delete();
                const warning = await message.channel.send(`🚨 ${message.author}, spam détecté, calme-toi !`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ==========================================
    // MENU =HELP AVEC LA CATÉGORIE AUTOMOD
    // ==========================================
    if (command === 'help') {
        const helpCategories = {
            sanctions: {
                label: 'Sanctions', emoji: '🔨', description: 'Gérer la modération (Réservé Owners)',
                commands: ['`=bl <@membre|id> [raison]` - Bannir', '`=unbl <user_id>` - Débannir ID', '`=blist` - Liste des bannis', '`=unbanall` - Débannir tout le monde', '`=kick <@membre>` - Expulser', '`=softbl <@membre>` - Softban']
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', description: 'Purger et nettoyer les salons',
                commands: ['`=clear <1-100|all>` - Supprimer des messages', '`=purge <@membre>` - Suppr msgs d\'un membre', '`=snipe` - Voir le dernier msg supprimé']
            },
            salons: {
                label: 'Salons', emoji: '🔒', description: 'Gestion et sécurité des salons',
                commands: ['`=lock` - Verrouiller', '`=unlock` - Déverrouiller', '`=slowmode <sec>` - Ralentissement', '`=nuke` - Recréer un salon', '`=createtext <nom>` - Créer salon texte', '`=createvoice <nom>` - Créer salon vocal']
            },
            automod: {
                label: 'Automod', emoji: '🛡️', description: 'Protections automatiques du serveur',
                commands: ['**Anti-Link** : Bloque les liens et invites', '**Anti-Spam** : Bloque l\'envoi excessif', '**Anti-Bot** : Kick auto des bots non autorisés']
            },
            config: {
                label: 'Configuration', emoji: '⚙️', description: 'Paramètres et rôles du bot',
                commands: ['`=owner <@membre>` - Ajouter un owner du bot', '`=setlog <#salon>` - Salon de logs', '`=setwelcome <#salon> <msg>` - Message de bienvenue']
            }
        };

        const catKeys = Object.keys(helpCategories);
        let currentIndex = 0;

        const generateEmbed = (index) => {
            const key = catKeys[index];
            const cat = helpCategories[key];
            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${cat.emoji} ${cat.label}`)
                .setDescription(cat.commands.join('\n'))
                .setFooter({ text: `Demandé par ${message.author.tag} • Page ${index + 1}/${catKeys.length}` });
        };

        const generateMenu = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_menu')
                    .setPlaceholder('📂 Choisir une catégorie...')
                    .addOptions(catKeys.map(k => ({
                        label: helpCategories[k].label,
                        description: helpCategories[k].description,
                        value: k,
                        emoji: helpCategories[k].emoji
                    })))
            );
        };

        const sentMsg = await message.reply({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });

        const collector = sentMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu ne t'appartient pas !", ephemeral: true });
            const selectedKey = i.values[0];
            currentIndex = catKeys.indexOf(selectedKey);
            await i.update({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });
        });
        return;
    }

    // ==========================================
    // COMMANDE =OWNER (Gestion des fondateurs bot)
    // ==========================================
    if (command === 'owner') {
        if (message.author.id !== message.guild.ownerId && !botOwners.has(message.author.id)) {
            return message.reply("❌ Seul le créateur principal du bot ou un Owner peut ajouter un nouvel Owner.");
        }
        const target = message.mentions.users.first();
        if (!target) return message.reply("Mentionne l'utilisateur à définir comme Owner.");
        
        botOwners.add(target.id);
        message.reply(`👑 **${target.tag}`} a été ajouté avec succès comme Owner du bot ! Il a désormais accès à toutes les commandes.`);
        return;
    }

    // VÉRIFICATION GLOBALE DES PERMISSIONS OWNER POUR LES COMMANDES SENSIBLES
    const sensitiveCommands = ['bl', 'unbl', 'blist', 'unbanall', 'kick', 'softbl', 'lock', 'unlock', 'slowmode', 'nuke', 'createtext', 'createvoice', 'setlog', 'setwelcome'];
    if (sensitiveCommands.includes(command)) {
        if (!isOwner(message) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Tu n'es pas **Owner** du bot ou Administrateur. Tu ne peux pas utiliser cette commande.");
        }
    }

    // ==========================================
    // SECTION SANCTIONS
    // ==========================================
    if (command === 'bl') {
        const targetId = args[0]?.replace(/<@!?|>/g, '');
        if (!targetId) return message.reply("Fournis un ID ou une mention valide.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await message.guild.members.ban(targetId, { reason });
            message.reply(`🔨 Utilisateur \`${targetId}\` banni. Raison : ${reason}`);
        } catch (e) { message.reply("Impossible de bannir cet utilisateur."); }
    }

    else if (command === 'unbl') {
        const userId = args[0];
        if (!userId) return message.reply("Donne l'ID à débannir.");
        try {
            await message.guild.members.unban(userId);
            message.reply(`🔓 Utilisateur \`${userId}\` débanni.`);
        } catch (e) { message.reply("Utilisateur introuvable dans les bannissements."); }
    }

    else if (command === 'blist') {
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• \`${b.user.tag}\` (${b.user.id})`).slice(0, 15).join('\n') || "Aucun banni.";
        const embed = new EmbedBuilder().setColor('#ff5555').setTitle("🔨 Liste des membres bannis").setDescription(banList);
        message.reply({ embeds: [embed] });
    }

    else if (command === 'unbanall') {
        const bans = await message.guild.bans.fetch();
        if (bans.size === 0) return message.reply("Aucun utilisateur banni.");
        for (const [userId] of bans) {
            await message.guild.members.unban(userId).catch(() => {});
        }
        message.reply(`🔓 Tous les utilisateurs (${bans.size}) ont été débannis.`);
    }

    else if (command === 'kick') {
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) return message.reply("Membre introuvable.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** a été expulsé.`);
        } catch (e) { message.reply("Impossible d'expulser ce membre."); }
    }

    else if (command === 'softbl') {
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) return message.reply("Membre introuvable.");
        try {
            await member.ban({ reason: "Softbl / Softban" });
            await message.guild.members.unban(member.id);
            message.reply(`🌪️ **${member.user.tag}** a subi un softban (messages effacés).`);
        } catch (e) { message.reply("Erreur lors du softbl."); }
    }

    // ==========================================
    // SECTION NETTOYAGE
    // ==========================================
    else if (command === 'clear') {
        const val = args[0];
        if (!val) return message.reply("Précise un nombre entre 1 et 100 ou `all`.");

        if (val.toLowerCase() === 'all') {
            try {
                let deleted;
                do {
                    deleted = await message.channel.bulkDelete(100, true);
                } while (deleted.size >= 2);
                const m = await message.channel.send("🧹 Salon entièrement nettoyé !");
                setTimeout(() => m.delete().catch(() => {}), 3000);
            } catch (e) { message.reply("Erreur lors du nettoyage massif."); }
            return;
        }

        const count = parseInt(val);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("Donne un nombre entre 1 et 100.");
        try {
            await message.delete();
            const fetched = await message.channel.messages.fetch({ limit: count });
            await message.channel.bulkDelete(fetched, true);
            const confirmation = await message.channel.send(`🧹 ${fetched.size} messages supprimés.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Impossible de supprimer des messages de plus de 14 jours."); }
    }

    else if (command === 'purge') {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Mentionne le membre dont tu veux purger les messages.");
        const limit = parseInt(args[1]) || 50;

        try {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === target.id).first(limit);
            await message.channel.bulkDelete(userMessages, true);
            const conf = await message.channel.send(`🧹 ${userMessages.length} messages de ${target.user.tag} supprimés.`);
            setTimeout(() => conf.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Erreur lors de la purge."); }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("Aucun message récent supprimé ici.");
        const embed = new EmbedBuilder()
            .setColor('#ff5555')
            .setAuthor({ name: sniped.author, iconURL: sniped.avatar })
            .setDescription(`**Contenu :**\n${sniped.content}`)
            .setFooter({ text: `Supprimé à ${sniped.time}` });
        message.reply({ embeds: [embed] });
    }

    // ==========================================
    // SECTION SALONS
    // ==========================================
    else if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply("🔒 Salon verrouillé avec succès.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            message.reply("🔓 Salon déverrouillé.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'slowmode') {
        const time = parseInt(args[0]);
        if (isNaN(time) || time < 0) return message.reply("Indique un nombre de secondes valide.");
        try {
            await message.channel.setRateLimitPerUser(time);
            message.reply(`⏱️ Slowmode réglé à ${time} secondes.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'nuke') {
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone();
            await message.channel.delete();
            newChannel.setPosition(position);
            newChannel.send("💥 Salon nuké et recréé à neuf !");
        } catch (e) { message.reply("Erreur lors du nuke."); }
    }

    else if (command === 'createtext') {
        const name = args.join('-');
        if (!name) return message.reply("Donne un nom au salon.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildText });
            message.reply(`✅ Salon textuel \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'createvoice') {
        const name = args.join(' ');
        if (!name) return message.reply("Donne un nom au salon.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildVoice });
            message.reply(`✅ Salon vocal \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    // ==========================================
    // CONFIGURATION
    // ==========================================
    else if (command === 'setlog') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Mentionne un salon textuel valide.");
        serverConfig.set(message.guild.id, { ...serverConfig.get(message.guild.id), logChannel: channel.id });
        message.reply(`⚙️ Salon de logs défini sur ${channel}.`);
    }

    else if (command === 'setwelcome') {
        const channel = message.mentions.channels.first();
        const customMsg = args.slice(1).join(' ');
        if (!channel || !customMsg) return message.reply("Utilisation : `=setwelcome <#salon> <message>`");
        serverConfig.set(message.guild.id, { ...serverConfig.get(message.guild.id), welcomeChannel: channel.id, welcomeText: customMsg });
        message.reply(`✅ Message de bienvenue configuré dans ${channel}.`);
    }
});

// ==========================================
// ANTI-BOT : Kick immédiat des bots non autorisés
// ==========================================
client.on('guildMemberAdd', async member => {
    if (member.user.bot) {
        try {
            await member.kick("Anti-Bot Automod : Ajout de bot non autorisé.");
            const config = serverConfig.get(member.guild.id);
            if (config && config.logChannel) {
                const logChan = member.guild.channels.cache.get(config.logChannel);
                if (logChan) logChan.send(`🛡️ **Automod Anti-Bot** : Le bot \`${member.user.tag}\` a été expulsé automatiquement car il n'a pas été ajouté par un Owner.`);
            }
        } catch (e) {}
        return;
    }

    // Message de bienvenue classique
    const config = serverConfig.get(member.guild.id);
    if (!config || !config.welcomeChannel) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;

    let text = config.welcomeText
        .replace('{mention}', `<@${member.id}>`)
        .replace('{name}', member.user.username)
        .replace('{server}', member.guild.name)
        .replace('{number}', member.guild.memberCount);

    channel.send(text).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);
