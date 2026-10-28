const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const PREFIX = '=';

// 📋 INTÉGRALITÉ DE TOUTES LES COMMANDES DE TES SCREENSHOTS
const helpCategories = {
    sanctions: {
        label: 'Sanctions',
        emoji: '🔨',
        description: 'Gérer la modération et les bannissements',
        commands: [
            '`=bl <@membre|pseudo|id> [raison]`\n└ Bannir (blacklist), par mention/pseudo ou ID (même hors serveur)',
            '`=unbl <user_id> [raison]`\n└ Débannir un utilisateur par son ID',
            '`=blist`\n└ Lister tous les membres bannis',
            '`=unbanall`\n└ Débannir tout le monde (admin, confirmation)',
            '`=kick <membre> [raison]`\n└ Expulser un membre',
            '`=softbl <membre> [raison]`\n└ Ban + déban immédiat (efface les msgs)'
        ]
    },
    nettoyage: {
        label: 'Nettoyage',
        emoji: '🧹',
        description: 'Nettoyer et purger les salons textuels',
        commands: [
            '`=clear <nombre|all>`\n└ Supprimer N messages ou tous dans le salon',
            '`=purge <membre> [nombre]`\n└ Supprimer les messages d\'un membre',
            '`=snipe [@membre]`\n└ Voir les messages supprimés récents'
        ]
    },
    salons: {
        label: 'Salons',
        emoji: '🔒',
        description: 'Gestion et paramétrage des salons du serveur',
        commands: [
            '`=lock [salon]`\n└ Verrouiller un salon',
            '`=unlock [salon]`\n└ Déverrouiller un salon',
            '`=slowmode <sec> [salon]`\n└ Définir le slowmode',
            '`=nuke [salon]`\n└ Recréer un salon (efface tout)',
            '`=createtext <nom> [catégorie]`\n└ Créer un salon textuel',
            '`=createvoice <nom> [catégorie]`\n└ Créer un salon vocal'
        ]
    },
    giveaways: {
        label: 'Giveaways',
        emoji: '🎉',
        description: 'Lancer et gérer des concours',
        commands: [
            '`=gcreate <durée> <gagnants> <prix>`\n└ Lancer un giveaway',
            '`=gend <message_id>`\n└ Terminer un giveaway immédiatement',
            '`=greroll <message_id>`\n└ Retirer un nouveau gagnant',
            '`=glist`\n└ Lister les giveaways actifs'
        ]
    },
    tickets: {
        label: 'Tickets',
        emoji: '🎫',
        description: 'Système de support et de gestion des tickets',
        commands: [
            '`=ticketsetup`\n└ ⭐️ Configuration visuelle (salons, texte, image/gif, catégories) + publier le panneau',
            '`=ticketadd <nom>`\n└ Créer un type de ticket (= un bouton)',
            '`=ticketremove <type>`\n└ Supprimer un type de ticket',
            '`=ticketedit <type> <champ> <valeur>`\n└ Modifier label/emoji/style/catégorie/message',
            '`=ticketrole <type> add/remove <@rôle>`\n└ Gérer les rôles staff d\'un type',
            '`=ticketquestion <type> add/remove/list`\n└ Gérer le formulaire d\'ouverture'
        ]
    },
    membres: {
        label: 'Membres & Rôles',
        emoji: '👤',
        description: 'Suivi des membres, statistiques et rôles automatiques',
        commands: [
            '`=invites [@membre]`\n└ Voir les invitations d\'un membre',
            '`=statistic [@membre]`\n└ Stats messages & temps vocal d\'un membre',
            '`=leaderboard`\n└ Top 3 messages & Top 3 temps vocal + ton classement',
            '`=autorole <@r1 @r2...|add|remove|list|clear>`\n└ Auto-rôles (plusieurs) à l\'arrivée',
            '`=massrole <add|remove> <@rôle> [humans|bots|all|@filtre]`\n└ Ajouter/retirer un rôle à plein de membres (+massrole stop)',
            '`=setwelcome <salon> <message>`\n└ Message de bienvenue (variables : {mention} {name} {server} {number})'
        ]
    },
    config: {
        label: 'Configuration',
        emoji: '⚙️',
        description: 'Paramètres généraux, logs et salons vocaux',
        commands: [
            '`=setlog <salon>`\n└ Définir le salon de logs',
            '`=setmuterole <rôle>`\n└ Définir le rôle muet (legacy)',
            '`=setjtc create | <#salon>`\n└ Salon \'Rejoindre pour créer\' (salons vocaux persos)',
            '`=removejtc`\n└ Désactiver les salons vocaux temporaires',
            '`=setinvitecheck <#salon>`\n└ Salon de suivi des invitations (qui a invité qui)',
            '`=removeinvitecheck`\n└ Désactiver le suivi des invitations'
        ]
    }
};

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} !`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Système de commande =help avec menu déroulant interactif
    if (command === 'help') {
        const defaultCategoryKey = 'sanctions';
        const cat = helpCategories[defaultCategoryKey];

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`${cat.emoji} ${cat.label}`)
            .setDescription(cat.commands.join('\n\n'))
            .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${cat.label}` });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('📂 Choisir une catégorie...')
            .addOptions(
                Object.keys(helpCategories).map(key => ({
                    label: helpCategories[key].label,
                    description: helpCategories[key].description,
                    value: key,
                    emoji: helpCategories[key].emoji
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const sentMessage = await message.reply({ embeds: [embed], components: [row] });

        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "Tu n'as pas le droit d'utiliser ce menu !", ephemeral: true });
            }

            if (interaction.customId === 'help_menu') {
                const selectedKey = interaction.values[0];
                const selectedCat = helpCategories[selectedKey];

                const updatedEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`${selectedCat.emoji} ${selectedCat.label}`)
                    .setDescription(selectedCat.commands.join('\n\n'))
                    .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${selectedCat.label}` });

                await interaction.update({ embeds: [updatedEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            sentMessage.edit({ components: [] }).catch(() => {});
        });
    }
});

client.login(process.env.TOKEN); // Utilise les variables d'environnement de Render
