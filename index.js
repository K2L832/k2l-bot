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

// 📋 TOUTES LES COMMANDES EXACTES DE TES SCREENSHOTS
const helpCategories = {
    sanctions: {
        label: 'Sanctions',
        emoji: '🔨',
        description: 'Gérer la modération et les bannissements',
        commands: [
            '`=bl <@membre|pseudo|id> [raison]`\n└ Bannir (blacklist), par mention/pseudo ou ID (même hors serveur)',[span_0](start_span)[span_0](end_span)
            '`=unbl <user_id> [raison]`\n└ Débannir un utilisateur par son ID',[span_1](start_span)[span_1](end_span)
            '`=blist`\n└ Lister tous les membres bannis',[span_2](start_span)[span_2](end_span)
            '`=unbanall`\n└ Débannir tout le monde (admin, confirmation)',[span_3](start_span)[span_3](end_span)
            '`=kick <membre> [raison]`\n└ Expulser un membre',[span_4](start_span)[span_4](end_span)
            '`=softbl <membre> [raison]`\n└ Ban + déban immédiat (efface les msgs)[span_5](start_span)'[span_5](end_span)
        ]
    },
    nettoyage: {
        label: 'Nettoyage',
        emoji: '🧹',
        description: 'Nettoyer et purger les salons textuels',
        commands: [
            '`=clear <nombre|all>`\n└ Supprimer N messages ou tous dans le salon',[span_6](start_span)[span_6](end_span)
            '`=purge <membre> [nombre]`\n└ Supprimer les messages d\'un membre',[span_7](start_span)[span_7](end_span)
            '`=snipe [@membre]`\n└ Voir les messages supprimés récents[span_8](start_span)'[span_8](end_span)
        ]
    },
    salons: {
        label: 'Salons',
        emoji: '🔒',
        description: 'Gestion et paramétrage des salons du serveur',
        commands: [
            '`=lock [salon]`\n└ Verrouiller un salon',[span_9](start_span)[span_9](end_span)
            '`=unlock [salon]`\n└ Déverrouiller un salon',[span_10](start_span)[span_10](end_span)
            '`=slowmode <sec> [salon]`\n└ Définir le slowmode',[span_11](start_span)[span_11](end_span)
            '`=nuke [salon]`\n└ Recréer un salon (efface tout)',[span_12](start_span)[span_12](end_span)
            '`=createtext <nom> [catégorie]`\n└ Créer un salon textuel',[span_13](start_span)[span_13](end_span)
            '`=createvoice <nom> [catégorie]`\n└ Créer un salon vocal[span_14](start_span)'[span_14](end_span)
        ]
    },
    giveaways: {
        label: 'Giveaways',
        emoji: '🎉',
        description: 'Lancer et gérer des concours',
        commands: [
            '`=gcreate <durée> <gagnants> <prix>`\n└ Lancer un giveaway',[span_15](start_span)[span_15](end_span)
            '`=gend <message_id>`\n└ Terminer un giveaway immédiatement',[span_16](start_span)[span_16](end_span)
            '`=greroll <message_id>`\n└ Retirer un nouveau gagnant',[span_17](start_span)[span_17](end_span)
            '`=glist`\n└ Lister les giveaways actifs[span_18](start_span)'[span_18](end_span)
        ]
    },
    tickets: {
        label: 'Tickets',
        emoji: '🎫',
        description: 'Système de support et de gestion des tickets',
        commands: [
            '`=ticketsetup`\n└ ⭐️ Configuration visuelle (salons, texte, image/gif, catégories) + publier le panneau',[span_19](start_span)[span_19](end_span)
            '`=ticketadd <nom>`\n└ Créer un type de ticket (= un bouton)',[span_20](start_span)[span_20](end_span)
            '`=ticketremove <type>`\n└ Supprimer un type de ticket',[span_21](start_span)[span_21](end_span)
            '`=ticketedit <type> <champ> <valeur>`\n└ Modifier label/emoji/style/catégorie/message',[span_22](start_span)[span_22](end_span)
            '`=ticketrole <type> add/remove <@rôle>`\n└ Gérer les rôles staff d\'un type',[span_23](start_span)[span_23](end_span)
            '`=ticketquestion <type> add/remove/list`\n└ Gérer le formulaire d\'ouverture[span_24](start_span)'[span_24](end_span)
        ]
    },
    membres: {
        label: 'Membres & Rôles',
        emoji: '👤',
        description: 'Suivi des membres, statistiques et rôles automatiques',
        commands: [
            '`=invites [@membre]`\n└ Voir les invitations d\'un membre',[span_25](start_span)[span_25](end_span)
            '`=statistic [@membre]`\n└ Stats messages & temps vocal d\'un membre',[span_26](start_span)[span_26](end_span)
            '`=leaderboard`\n└ Top 3 messages & Top 3 temps vocal + ton classement',[span_27](start_span)[span_27](end_span)
            '`=autorole <@r1 @r2...|add|remove|list|clear>`\n└ Auto-rôles (plusieurs) à l\'arrivée',[span_28](start_span)[span_28](end_span)
            '`=massrole <add|remove> <@rôle> [humans|bots|all|@filtre]`\n└ Ajouter/retirer un rôle à plein de membres (+massrole stop)',[span_29](start_span)[span_29](end_span)
            '`=setwelcome <salon> <message>`\n└ Message de bienvenue (variables : {mention} {name} {server} {number})[span_30](start_span)'[span_30](end_span)
        ]
    },
    config: {
        label: 'Configuration',
        emoji: '⚙️',
        description: 'Paramètres généraux, logs et salons vocaux',
        commands: [
            '`=setlog <salon>`\n└ Définir le salon de logs',[span_31](start_span)[span_31](end_span)
            '`=setmuterole <rôle>`\n└ Définir le rôle muet (legacy)',[span_32](start_span)[span_32](end_span)
            '`=setjtc create | <#salon>`\n└ Salon \'Rejoindre pour créer\' (salons vocaux persos)',[span_33](start_span)[span_33](end_span)
            '`=removejtc`\n└ Désactiver les salons vocaux temporaires',[span_34](start_span)[span_34](end_span)
            '`=setinvitecheck <#salon>`\n└ Salon de suivi des invitations (qui a invité qui)',[span_35](start_span)[span_35](end_span)
            '`=removeinvitecheck`\n└ Désactiver le suivi des invitations[span_36](start_span)'[span_36](end_span)
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

    // Commande =help interactive avec le menu déroulant
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

client.login('TON_TOKEN_BOT_DISCORD');
