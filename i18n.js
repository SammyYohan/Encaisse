/* Encaisse i18n — clés = texte source français (pattern gettext).
   Clé absente du dictionnaire => le français reste affiché (dégradation propre).
   Variables : t("Bonjour {w}", {w:"Ana"}) remplace {w}. */
(function () {
  "use strict";

  const EN = {
    "{n} facture(s)": "{n} invoice(s)",
    "{n} facture(s) à suivre · {m} à encaisser sous 30 j · {l} en retard critique": "{n} invoice(s) to watch · {m} to collect within 30 days · {l} critically late",
    "{n} ligne(s)": "{n} line(s)",
    "+ Client": "+ Client",
    "+ Créer mon premier devis": "+ Create my first quote",
    "🍲 Resto / Food": "🍲 Restaurant / Food",
    "💇 Beauté / Bien-être": "💇 Beauty / Wellness",
    "💼 Services / Freelance": "💼 Services / Freelance",
    "🔨 Artisan / BTP": "🔨 Contractor / Trades",
    "🧪 Mode démonstration — aucun paiement réel tant que Stripe n'est pas branché.": "🧪 Demo mode — no real payment until Stripe is connected.",
    "🛍️ Commerce / Boutique": "🛍️ Retail / Shop",
    "🛵 Transport / Livraison": "🛵 Transport / Delivery",
    "0% commission sur tes encaissements.": "0% commission on your collections.",
    "12 rue des Arts, 75011 Paris": "12 Rue des Arts, 75011 Paris",
    "3 utilisateurs + support prioritaire": "3 users + priority support",
    "À encaisser": "To collect",
    "à jour ✓": "up to date ✓",
    "À relancer en priorité": "Follow up first",
    "À suivre": "To watch",
    "Accueil": "Home",
    "Acompte": "Deposit",
    "acompte déduit": "deposit deducted",
    "Acompte déduit": "Deposit deducted",
    "Acompte déjà réglé": "Deposit already paid",
    "Activité enregistrée ✓": "Business profile saved ✓",
    "Adresse (mentions légales)": "Address (legal notice)",
    "Adresse (pour la facture)": "Address (for the invoice)",
    "Ajoute d'abord un client": "Add a client first",
    "Ajoute ton premier client pour facturer en 1 clic.": "Add your first client to invoice in one click.",
    "Ajouter ✓": "Add ✓",
    "Ajouter une ligne vide": "Add an empty line",
    "an": "year",
    "Annuel": "Yearly",
    "annuel -20%": "yearly -20%",
    "Annuel -20%": "Yearly -20%",
    "Actions": "Actions",
    "Annuler": "Cancel",
    "Aperçu / Imprimer": "Preview / Print",
    "Appeler": "Call",
    "archivage": "archiving",
    "Article": "Item",
    "Aucun document.": "No documents yet.",
    "Aucun retard. Beau travail 🎉": "Nothing overdue. Nice work 🎉",
    "Bon pour accord signé": "Approved & signed",
    "Bonjour {w}, nous confirmons la bonne réception de votre règlement pour la facture {n} ({a}).\nVotre reçu est disponible ici : {u}\n\nMerci pour votre confiance ! 🙏 — {b}": "Hello {w}, we confirm receipt of your payment for invoice {n} ({a}).\nYour receipt is available here : {u}\n\nThank you for your trust! 🙏 — {b}",
    "Bonjour {w}, petit rappel : facture {n} de {a} (échéance {e}, {j}j de retard). Lien pour régler : {u} Merci beaucoup 🙏 — {b}": "Hello {w}, a quick reminder: invoice {n} for {a} (due {e}, {j} days overdue). Pay here: {u} Thank you very much 🙏 — {b}",
    "Bonjour {w}, voici votre devis {n} d'un montant de {a} ({b}).\nConsultez-le et validez-le ici : {u}\n\nRestant à votre entière disposition 🙏": "Hello {w}, here is your quote {n} for {a} ({b}).\nReview and approve it here: {u}\n\nAt your disposal 🙏",
    "Bonjour {w}, voici votre facture {n} d'un montant de {a} ({b}).\nLien de paiement sécurisé : {u}\nÉchéance : {e}.\n\nMerci beaucoup ! 🙏": "Hello {w}, here is invoice {n} for {a} ({b}).\nSecure payment link: {u}\nDue date: {e}.\n\nThank you! 🙏",
    "Bonjour 👋": "Hello 👋",
    "Bonjour Awa, facture FAC-2026-0042 de 850 €, lien : pay… 👋": "Hi Awa, invoice FAC-2026-0042 for €850.00, link: pay… 👋",
    "Brouillon": "Draft",
    "Ce client n'a ni téléphone ni e-mail : complète sa fiche pour activer l'envoi en 1 clic.": "This client has neither phone nor e-mail: complete their card to enable 1-click sending.",
    "Ce client n'a pas d'e-mail.": "This client has no e-mail address.",
    "Ce client n'a pas de téléphone : ajoute un e-mail ou copie le lien.": "This client has no phone: add an e-mail or copy the link.",
    "CGU / CGV": "Terms of service",
    "Change de filtre ou crée un document en 60s.": "Change the filter or create a document in 60s.",
    "Changer d'offre": "Change plan",
    "Chercher client, n°…": "Search client, no…",
    "Choisir Pro": "Choose Pro",
    "Choisir Solo": "Choose Solo",
    "Client": "Client",
    "Client ajouté ✓": "Client added ✓",
    "Clients": "Clients",
    "Compte créé ✓ {n} factures gratuites par mois · devis illimités": "Account created ✓ {n} free invoices per month · unlimited quotes",
    "Confidentialité": "Privacy policy",
    "Confirmer encaissement de {n} ?": "Confirm payment of {n}?",
    "Constat & preuve de réalisation": "Site report & completion proof",
    "Continuer →": "Continue →",
    "Converti en facture ✓": "Converted to invoice ✓",
    "Copie manuelle": "Copy manually",
    "Copier": "Copy",
    "Copier le lien": "Copy the link",
    "crée d'abord un client": "create a client first",
    "Crée ta première facture pour activer la prévision.": "Create your first invoice to enable the forecast.",
    "créée ✓": "created ✓",
    "créée ✓ Envoie-la au client": "created ✓ Send it to your client",
    "Créer la facture ✓": "Create invoice ✓",
    "Créer la facture d'acompte ✓": "Create deposit invoice ✓",
    "Créer la ligne de cette photo": "Create the line for this photo",
    "Créer le devis ✓": "Create quote ✓",
    "Créer mon compte →": "Create my account →",
    "cycle": "cycle",
    "Cycle": "Cycle",
    "déjà": "already",
    "Demander un acompte": "Request a deposit",
    "Démo : rendu à valider par ton comptable tant que la plateforme d'e-invoicing n'est pas branchée.": "Demo: have your accountant validate the layout until the e-invoicing platform is connected.",
    "Démo réinitialisée": "Demo reset",
    "Derniers documents": "Latest documents",
    "Désignation": "Description",
    "Devis": "Quote",
    "DEVIS": "QUOTE",
    "Devis → facture → paiement → relance. 60 secondes, même hors-ligne.": "Quote → invoice → payment → reminder. 60 seconds, even offline.",
    "Devis + factures": "Quotes + invoices",
    "Devis en 60 secondes sur chantier, même sans réseau. Facture aux mentions de ton pays. Lien de paiement. Relance guidée. Un seul flux, fini à la perfection.": "A quote in 60 seconds on site, even with no signal. Invoice with your country's mandatory details. Payment link. Guided reminders. One single flow, perfectly finished.",
    "Devis envoyé": "Quote sent",
    "Devis pour": "Quote for",
    "Devis signé ✓ Bon pour accord validé !": "Quote signed ✓ Approved & confirmed!",
    "Devise": "Currency",
    "Dictée ajoutée ✓": "Dictation added ✓",
    "Dictée impossible hors-ligne": "Dictation unavailable offline",
    "Dictée non supportée ici": "Dictation not supported here",
    "Dicter la prestation": "Dictate the job",
    "Dis-moi où tu factures : le prix s'adapte automatiquement. Devis illimités, 3 factures gratuites par mois, sans carte.": "Tell us where you invoice: pricing adapts automatically. Unlimited quotes, 3 free invoices per month, no card.",
    "Docs": "Docs",
    "factures/mois": "invoices/mo",
    "facture(s) gratuite(s) restante(s) ce mois-ci · devis illimités · ensuite Solo": "free invoice(s) left this month · unlimited quotes · then Solo",
    "doit": "owes",
    "dupliquée ✓": "duplicated ✓",
    "Facture éditée en PDF · e-facture Peppol-BIS obligatoire entre assujettis TVA depuis le 01/01/2026": "Issued as a PDF · Peppol-BIS e-invoice mandatory between VAT-registered parties since 1 Jan 2026",
    "E-mail": "E-mail",
    "E-mail / téléphone": "E-mail / phone",
    "E-mail →": "E-mail →",
    "échéance": "due",
    "Échéance": "Due date",
    "Échéance dans {j} j": "Due in {j} d",
    "Échéances J+3 / J+7 / J+15": "Due dates D+3 / D+7 / D+15",
    "Écoute…": "Listening…",
    "Effacer": "Clear",
    "Émetteur": "Issuer",
    "Émis le": "Issued on",
    "émise": "issued",
    "en annuel": "yearly",
    "En cas de retard, pénalités légales et indemnité forfaitaire de 40 € (art. L441-10 C. com.) applicables. Archivage": "Late payment triggers statutory interest and a flat €40 recovery fee (French Commercial Code L441-10). Archiving",
    "En ligne": "Online",
    "En retard": "Overdue",
    "En retard >7j": "Overdue >7d",
    "Encaissé 🎉": "Collected 🎉",
    "Encaissé 🎉 Bravo": "Collected 🎉 Well done",
    "Encaissé ce mois": "Collected this month",
    "Enregistrer": "Save",
    "Enregistrer les modifications ✓": "Save changes ✓",
    "Envoie ce lien par e-mail/WhatsApp ou fais scanner le QR code. Le client paie par Stripe :": "Send this link by e-mail/WhatsApp or have the QR code scanned. Your client pays with Stripe:",
    "Envoyée": "Sent",
    "Erreur de lecture du fichier JSON": "Could not read that JSON file",
    "exemple": "sample",
    "Exemples non comptés.": "Samples are not counted.",
    "Ex : Atelier Koné BTP": "E.g. Koné Contractor",
    "contact@atelier.fr · +33 6 …": "contact@atelier.com · +1 555 …",
    "FR12345678901": "VAT / EIN (e.g. FR12345678901)",
    "FR76 3000 …": "IBAN / Bank details (optional)",
    "Net": "Net",
    "Export téléchargé ✓": "Export downloaded ✓",
    "Exporter JSON": "Export JSON",
    "Exporter CSV": "Export CSV",
    "Export CSV téléchargé ✓": "CSV export downloaded ✓",
    "Partage protégé — rouvre la fiche depuis cet appareil.": "Protected share — reopen this record on your own device.",
    "Sauvegarde en ligne chiffrée": "Encrypted online backup",
    "Copie chiffrée de tout l'appareil. Même nous ne pouvons pas la lire.": "Encrypted copy of the whole device. Even we cannot read it.",
    "Sauvegarder maintenant": "Back up now",
    "Code de récupération": "Recovery code",
    "Restaurer": "Restore",
    "Sauvegarde envoyée ✓": "Backup sent ✓",
    "Échec de sauvegarde — réessaie plus tard.": "Backup failed — try again later.",
    "Connexion requise pour sauvegarder.": "Connection required to back up.",
    "Dernière sauvegarde : {d}": "Last backup: {d}",
    "Jamais sauvegardé": "Never backed up",
    "Ne le perds pas : sans lui, pas de restauration.": "Keep it safe: no code, no restore.",
    "Copier le code": "Copy the code",
    "Code copié ✓": "Code copied ✓",
    "Colle ton code de récupération :": "Paste your recovery code:",
    "Code invalide (64 caractères).": "Invalid code (64 characters).",
    "Sauvegarde introuvable pour ce code.": "No backup found for this code.",
    "Sauvegarde illisible.": "Unreadable backup.",
    "Écraser cet appareil avec la sauvegarde du {d} ?": "Overwrite this device with the backup from {d} ?",
    "Restauration terminée ✓": "Restore complete ✓",
    "Facture": "Invoice",
    "FACTURE": "INVOICE",
    "Facturé à (Client)": "Billed to (Client)",
    "Facture d'acompte": "Deposit invoice",
    "Facture éditée en PDF · échange structuré EN 16931 (Factur-X / UBL / CII) entre assujettis TVA": "Issued as a PDF · EN 16931 structured exchange (Factur-X / UBL / CII) between VAT-registered parties",
    "Facture payée ✓": "Invoice paid ✓",
    "Facturer": "Invoice",
    "Factures": "Invoices",
    "Faire signer": "Have it signed",
    "Faire signer le client maintenant (Bon pour accord)": "Have the client sign now (Approve)",
    "Fais signer le client avant de valider": "Have the client sign before confirming",
    "Fais signer le client avec le doigt sur l'écran :": "Have the client sign with their finger on the screen:",
    "Fait foi de bon pour accord": "Legally binding approval",
    "ferme": "firm",
    "Fermer": "Close",
    "Fichier JSON invalide": "Invalid JSON file",
    "Gratuit": "Free",
    "h, pce…": "h, ea…",
    "Hors-ligne · tout marche": "Offline · everything works",
    "Hors-ligne d'abord": "Offline-first",
    "IBAN / RIB (facultatif)": "IBAN / account number (optional)",
    "illimités": "unlimited",
    "Importer JSON": "Import JSON",
    "Imprimer / PDF": "Print / PDF",
    "Installer": "Install",
    "Installer l'app": "Install the app",
    "Installer Encaisse sur ton écran d'accueil": "Install Encaisse on your home screen",
    "📲 Installer l'app": "📲 Install the app",
    "📲 Installe Encaisse sur ton écran d'accueil": "📲 Install Encaisse to your home screen",
    "Ça ouvre comme une app, même hors-ligne, sans passer par l'App Store.": "It opens like an app, works offline, without going through the App Store.",
    "Appuie sur Partager ⬆️ en bas de l'écran": "Tap Share ⬆️ at the bottom of the screen",
    "Choisis « Ajouter à l'écran d'accueil »": "Choose “Add to Home Screen”",
    "Confirme : Ajouter, en haut à droite": "Confirm: Add, at the top right",
    "Sur iPhone / iPad, l'installation se fait en 3 gestes (il n'y a pas de bouton automatique) :": "On iPhone / iPad, installation takes 3 steps (there is no automatic prompt):",
    "Compris ✓": "Got it ✓",
    "Masquer": "Hide",
    "Utilise le menu du navigateur → Installer l'application": "Use your browser menu → Install app",
    "Encaisse installée ✓": "Encaisse installed ✓",
    "Encaisse est déjà installée ✓": "Encaisse is already installed ✓",
    "Inscription 30 secondes.<br><mark>Tarif de ton pays.</mark>": "Sign up in 30 seconds.<br><mark>Priced for your country.</mark>",
    "jour(s) de retard": "day(s) overdue",
    "L'app te dit qui relancer et quand — J+3 poli, J+7 ferme, J+15 mise en demeure — et pré-remplit le message WhatsApp ou e-mail. Tu envoies en 1 clic. Un écran : qui te doit combien, depuis quand.": "The app tells you who to chase and when — D+3 polite, D+7 firm, D+15 formal notice — and pre-fills the WhatsApp or e-mail message. You send it in 1 click. One screen: who owes you what, and since when.",
    "Langue de l'interface": "Interface language",
    "Légal": "Legal",
    "Les futures factures en retard apparaîtront ici.": "Future overdue invoices will show up here.",
    "Les impayés<br>se relancent <mark>sans honte.</mark>": "Chase unpaid invoices<br><mark>without the awkwardness.</mark>",
    "Libellé": "Description",
    "Libre": "Custom",
    "Lien : ": "Link: ",
    "Lien copié ✓": "Link copied ✓",
    "Lien de paiement": "Payment link",
    "Lien de paiement Stripe + relances": "Stripe payment link + reminders",
    "Lien direct": "Direct link",
    "Lien paiement": "Pay link",
    "Lien local : ne fonctionne que sur cet appareil. Renseigne SITE_URL (config.js) pour un vrai lien client.": "Local link: works only on this device. Set SITE_URL (config.js) for a real customer link.",
    "Ligne créée — mets le prix": "Line created — enter the price",
    "Limite gratuite du mois atteinte — passe au payant pour refaire ce document.": "Free monthly limit reached — upgrade to redo this document.",
    "Marge nette ~{m}% après frais + infra": "Net margin ~{m}% after fees + infra",
    "Marquer payée ✓": "Mark as paid ✓",
    "mensuel": "monthly",
    "Mensuel": "Monthly",
    "Mentions légales": "Legal notice",
    "Message copié ✓": "Message copied ✓",
    "Mets au moins un prix": "Enter at least one price",
    "mis à jour ✓": "updated ✓",
    "mise en demeure": "formal notice",
    "Mise en demeure · {j}j": "Formal notice · {j}d",
    "Mode démonstration : aucun débit. Branche ta clé Stripe secrète pour encaisser.": "Demo mode: no charge. Connect your Stripe secret key to take payments.",
    "Modifie les lignes ou les conditions": "Edit the lines or the terms",
    "Modifier": "Edit",
    "mois": "month",
    "Mon activité": "My business",
    "Mon Entreprise": "My Business",
    "Montant acompte": "Deposit amount",
    "Montant d'acompte invalide": "Invalid deposit amount",
    "Moyens de paiement acceptés": "Accepted payment methods",
    "N° TVA / SIRET / EIN": "VAT / SIRET / EIN no.",
    "N° TVA / VAT": "VAT no.",
    "N° TVA / VAT / EIN (facultatif)": "VAT / EIN no. (optional)",
    "N° TVA intracom.": "EU VAT no.",
    "Net à payer": "Net due",
    "Nom + repère": "Name + reference",
    "Nom de ta boîte (ex : Atelier Koné)": "Your business name (e.g. Koné Renovation)",
    "Nom entreprise / activité": "Business / trade name",
    "Nom requis": "Name required",
    "Nouveau": "New",
    "Nouveau client": "New client",
    "Nouveau document": "New document",
    "Numéros inviolables": "Tamper-proof numbering",
    "Numérotation chronologique inviolable. Modalités de paiement": "Tamper-proof chronological numbering. Payment terms",
    "Numérotation inviolable": "Tamper-proof numbering",
    "Numérotation inviolable, jamais remise à zéro, montants en centimes, journal horodaté. Conservation {a}. Export comptable en 1 clic.": "Tamper-proof numbering, never reset, amounts stored in cents, timestamped log. Retention {a}. One-click accounting export.",
    "Offre": "Plan",
    "P.U.": "Unit price",
    "Paiement Stripe à confirmer — le tunnel de checkout sera branché avec ta clé secrète.": "Stripe payment to confirm — checkout will be wired up with your secret key.",
    "Paiements": "Payments",
    "Paiements par Stripe. Rendus de démonstration tant que les clés API ne sont pas branchées.": "Payments by Stripe. Demo output until the API keys are connected.",
    "Partager": "Share",
    "Partager le document": "Share the document",
    "Passer": "Skip",
    "Passer au payant": "Upgrade",
    "Payée ✓": "Paid ✓",
    "Pays fiscal": "Tax country",
    "Photo chantier en preuve": "Site photo as proof",
    "Photo de chantier jointe en preuve, lignes en 3 champs, total calculé tout seul. Dictée vocale quand Chrome est en ligne. Hors-ligne d'abord : tout reste sur ton téléphone.": "A site photo attached as proof, line items in 3 fields, total calculated for you. Voice dictation when Chrome is online. Offline-first: everything stays on your phone.",
    "Photo illisible, réessaie": "Unreadable photo, try again",
    "Photo jointe ✓": "Photo attached ✓",
    "Plan": "Plan",
    "Plan actuel": "Current plan",
    "Plus d'actions": "More actions",
    "Plus tard": "Later",
    "poli": "polite",
    "pour": "for",
    "Preuve": "Proof",
    "Preuve & archivage": "Proof & archiving",
    "preuve horodatée": "timestamped proof",
    "Prévision 30 jours": "30-day forecast",
    "Prévision cash 30 j": "30-day cash forecast",
    "Prévision cash 30j + export comptable": "30-day cash forecast + accounting export",
    "Prix": "Price",
    "prix auto selon ton pays": "auto-priced for your country",
    "Prix unitaire": "Unit price",
    "Pro": "Pro",
    "Pro — pour encaisser plus": "Pro — collect more",
    "Progression": "Progress",
    "QR-facture suisse (SIX) · adresses structurées obligatoires": "Swiss QR-bill (SIX) · structured addresses required",
    "Qté": "Qty",
    "Quantité": "Quantity",
    "Reçu / Imprimer": "Receipt / Print",
    "Ref client": "Client ref",
    "Refaire": "Redo",
    "Réglages": "Settings",
    "Règlement sécurisé par Stripe": "Secure payment via Stripe",
    "Réinitialiser démo": "Reset demo",
    "Réinitialiser la démo ?": "Reset the demo?",
    "Relance": "Reminder",
    "Relance due · ferme · {j}j": "Reminder due · firm · {j}d",
    "Relance due · rappel poli (J+3)": "Reminder due · polite nudge (D+3)",
    "Relance J+7 envoyée ✓": "D+7 reminder sent ✓",
    "relance(s)": "reminder(s)",
    "Relancer": "Chase",
    "Retirer": "Remove",
    "Retirer ce client ?": "Remove this client?",
    "Rien ici.": "Nothing here.",
    "s'applique automatiquement.": "applies automatically.",
    "Sales tax": "Sales tax",
    "Sales tax n'est pas la TVA : taux d'État/local à appliquer": "Sales tax is not VAT: apply your state/local rate",
    "Sans engagement. 0% commission sur tes encaissements : tu paies uniquement tes frais Stripe (1,5 % en zone euro, 2,9 % aux États-Unis).": "No commitment. 0% commission on your collections: you only pay your Stripe fees (1.5% in the euro area, 2.9% in the United States).",
    "Sauvegarde importée ✓": "Backup imported ✓",
    "Scannez ce QR code pour ouvrir la facture et payer en 1 clic (carte, SEPA, ACH).": "Scan this QR code to open the invoice and pay in 1 click (card, SEPA, ACH).",
    "Signature client": "Client signature",
    "Signature client — Bon pour accord": "Client signature — Approval",
    "Signé": "Signed",
    "Signé ✓ Bon pour accord": "Signed ✓ Approved",
    "Signé par le client le": "Signed by the client on",
    "Solo": "Solo",
    "Solo — pour démarrer": "Solo — to get started",
    "Stockage plein : supprime une photo ou un vieux document": "Storage full: delete a photo or an old document",
    "Stripe uniquement": "Stripe only",
    "Suggestions rapides": "Quick suggestions",
    "Supprimer": "Delete",
    "Supprimer {n} ? Le compteur reste inviolable.": "Delete {n}? The counter stays tamper-proof.",
    "sur": "on",
    "Sur": "On",
    "Téléphone / WhatsApp": "Phone / WhatsApp",
    "Tes {n} factures gratuites par mois sont utilisées — les devis restent gratuits.": "Your {n} free invoices per month are used up — quotes stay free.",
    "Tu as atteint tes {n} factures gratuites ce mois-ci. Le devis reste gratuit — passe au payant pour continuer à facturer.": "You've reached your {n} free invoices this month. Quotes stay free — upgrade to keep invoicing.",
    "Ton activité": "Your trade",
    "Ton prix": "Your price",
    "Ton tarif": "Your rate",
    "Total HT": "Subtotal excl. tax",
    "Total TTC": "Total incl. tax",
    "Total TTC estimé": "Estimated total incl. tax",
    "Tous": "All",
    "Tout Solo": "Everything in Solo",
    "Tout voir": "See all",
    "Tu travailles.<br>Tu dois être <mark>payé.</mark>": "You do the work.<br>You deserve to get <mark>paid.</mark>",
    "TVA": "VAT",
    "Un bouton.<br>Zéro paperasse.": "One button.<br>Zero paperwork.",
    "Un nom suffit. L'e-mail active l'envoi en 1 clic, le téléphone la relance WhatsApp.": "A name is enough. E-mail enables 1-click sending, phone enables WhatsApp reminders.",
    "Une facture d'acompte est émise avec son propre lien de paiement Stripe. Le solde est automatiquement déduit de la facture finale.": "A deposit invoice is issued with its own Stripe payment link. The balance is automatically deducted from the final invoice.",
    "Une facture payée ne peut plus être modifiée": "A paid invoice can no longer be edited",
    "Une mise à jour d'Encaisse est disponible. Recharger ?": "An Encaisse update is available. Reload?",
    "Unité": "Unit",
    "Valider la signature ✓": "Confirm signature ✓",
    "Voici ton cash": "Here's your cash",
    "Voir les offres →": "See plans →",
    "Voir photo jointe": "See attached photo",
    "WhatsApp & e-mail 1-clic": "WhatsApp & e-mail, 1 click",
    "Ce document est un PDF. La transmission e-facture (PDP France / Peppol Belgique / QR-facture SIX) s'active dès le branchement d'une plateforme agréée dans Réglages → Légal.": "This document is a PDF. E-invoice transmission (French PDP / Belgian Peppol / Swiss SIX QR-bill) activates once a certified platform is connected in Settings → Legal.",

    /* --- pays (options + grille d'onboarding) --- */
    "🇫🇷 France — Factur-X / PDP": "🇫🇷 France — Factur-X / PDP",
    "🇧🇪 Belgique — Peppol-BIS": "🇧🇪 Belgium — Peppol-BIS",
    "🇨🇭 Suisse — QR-facture": "🇨🇭 Switzerland — QR-bill",
    "🇺🇸 United States — Sales tax": "🇺🇸 United States — Sales tax",
    "🇫🇷 France · Factur-X": "🇫🇷 France · Factur-X",
    "🇧🇪 Belgique · Peppol": "🇧🇪 Belgium · Peppol",
    "🇨🇭 Suisse · QR-facture": "🇨🇭 Switzerland · QR-bill",
    "Abonnement activé ✓ Bienvenue !": "Subscription activated ✓ Welcome!",
    "Abonnement expiré — passe au payant pour garder tes factures illimitées.": "Subscription expired — upgrade to keep unlimited invoices.",
    "Connexion requise pour valider l'abonnement.": "Connection required to validate the subscription.",
    "Génération du lien client…": "Generating the customer link…",
    "Lien client sécurisé activé ✓": "Secure customer link activated ✓",
    "Paiement annulé — réessaie quand tu veux.": "Payment canceled — try again whenever you like.",
    "Paiement indisponible pour l'instant — réessaie dans un instant.": "Payment temporarily unavailable — try again in a moment.",
    "Paiement non confirmé — réessaie ou contacte le support.": "Payment not confirmed — retry or contact support.",
    "Portail client indisponible — lien local utilisé.": "Customer portal unavailable — local link used.",
    "Redirection vers le paiement sécurisé…": "Redirecting to secure payment…",
    "🇺🇸 United States · Sales tax": "🇺🇸 United States · Sales tax",

    /* --- P0 n°5 : avoirs (credit notes — obligatoires FR/BE) --- */
    "Avoir": "Credit note",
    "AVOIR": "CREDIT NOTE",
    "Avoir émis": "Credit note issued",
    "Avoir remboursé ✓": "Credit note refunded ✓",
    "Remboursée ✓": "Refunded ✓",
    "Marquer remboursée ✓": "Mark as refunded ✓",
    "Émettre un avoir": "Issue a credit note",
    "Avoirs émis": "Credit notes issued",
    "Facture d'origine": "Original invoice",
    "Reprend les lignes de {n} ({a}) pour {c}. Série AVT dédiée — modifiable tant qu'il n'est pas remboursé.": "Copies the lines of {n} ({a}) for {c}. Dedicated AVT series — editable until refunded.",
    "Créer l'avoir ✓": "Create the credit note ✓",
    "Confirmer le remboursement de {n} ?": "Confirm refund of {n}?",
    "Un avoir remboursé ne peut plus être modifié": "A refunded credit note can no longer be edited",
    "Avoir client": "Customer credit note",
    "Avoir au titre de la facture {n} — consultez-le et conservez ce document.": "Credit note for invoice {n} — review it and keep this document.",
    "Avoir conforme — annule ou réduit la facture {n}. Numérotation chronologique inviolable. Archivage {a}.": "Compliant credit note — cancels or reduces invoice {n}. Sequential numbering, never reused. Records kept {a}.",
    "Partager l'avoir": "Share the credit note",
    "Envoie ce lien par e-mail/WhatsApp ou fais scanner le QR code.": "Send this link by e-mail/WhatsApp or have the QR code scanned.",
    "Bonjour {w}, voici votre avoir {n} émis au titre de la facture {f}, d'un montant de {a} ({b}).\nConsultez-le ici : {u}\n\nMerci pour votre compréhension 🙏": "Hello {w}, here is credit note {n} issued for invoice {f}, for {a} ({b}).\nReview it here: {u}\n\nThank you for your understanding 🙏",

    /* (E-mails serveur retirés pour le moment : ces clés restent traduites dans lang/* au cas où.) */
    "Devis déjà converti": "Quote already converted",
    "Acompte impayé — non déduit": "Unpaid deposit — not deducted",

    /* --- Mise en production : mentions honnêtes, relances J+3/J+7/J+15, offre Pro réelle --- */
    "Document PDF édité par l'artisan · transmission e-facture via PDP agréée requise entre assujettis (réception obligatoire depuis le 01/09/2026)": "PDF issued by the tradesperson · e-invoice transmission via a certified PDP required between VAT-registered parties (receiving mandatory since 1 Sep 2026)",
    "Document PDF · Peppol-BIS obligatoire en B2B depuis le 01/01/2026 — ce PDF seul ne suffit pas entre assujettis": "PDF document · Peppol-BIS mandatory in B2B since 1 Jan 2026 — this PDF alone is not enough between VAT-registered parties",
    "Document PDF avec mentions suisses · QR affiché = lien de paiement Stripe (pas un QR SIX bancaire)": "PDF with Swiss mandatory details · displayed QR = Stripe payment link (not a SIX bank QR)",
    "Document PDF · sales tax d'État/local saisie à la main — à faire valider par ton comptable": "PDF document · state/local sales tax entered by hand — have your accountant validate it",
    "Sauvegarde chiffrée multi-appareils": "Encrypted multi-device backup",
    "Support prioritaire": "Priority support",
    "Bonjour {w}, facture {n} de {a} impayée depuis {j}j (échéance {e}). Merci de régler ici : {u} — sans règlement sous 7 jours, des pénalités légales s'appliqueront. Cordialement, {b}": "Hello {w}, invoice {n} for {a} unpaid for {j}d (due {e}). Please pay here: {u} — without payment within 7 days, statutory late penalties will apply. Regards, {b}",
    "Mise en demeure — facture {n} de {a} impayée depuis {j}j (échéance {e}). Dernier rappel avant recouvrement : réglez ici {u}. Pénalités légales + indemnité forfaitaire 40 € (art. L441-10 C. com.) applicables. — {b}": "Formal notice — invoice {n} for {a} unpaid for {j}d (due {e}). Final reminder before collection: pay here {u}. Statutory penalties + €40 flat recovery fee (French Commercial Code L441-10) apply. — {b}",
    "Image horodatée — à archiver avec le devis (ne remplace pas une signature certifiée)": "Timestamped image — archive with the quote (not a certified e-signature)",
    "Numérotation inviolable, jamais remise à zéro, montants en centimes, journal horodaté. Conservation {a} à ta charge : exporte en JSON/CSV et active la sauvegarde chiffrée — téléphone perdu = historique perdu sans sauvegarde. CSV = liste simple, pas un FEC.": "Tamper-proof numbering, never reset, amounts in cents, timestamped log. Retention {a} is on you: export JSON/CSV and enable the encrypted backup — lost phone = lost history without a backup. CSV = simple list, not a FEC.",
    "⚠️ B2B : Peppol-BIS obligatoire depuis le 01/01/2026 — ce PDF seul ne suffit pas entre assujettis.": "⚠️ B2B: Peppol-BIS mandatory since 1 Jan 2026 — this PDF alone is not enough between VAT-registered parties.",
    "⚠️ Entre assujettis : transmission via PDP agréée requise (réception obligatoire depuis le 01/09/2026).": "⚠️ Between VAT-registered parties: transmission via a certified PDP required (receiving mandatory since 1 Sep 2026).",
    "Devis en 60 secondes sur chantier, même sans réseau. Facture PDF avec les mentions de ton pays. Lien de paiement. Relance guidée. Un seul flux, fini à la perfection.": "A quote in 60 seconds on site, even with no signal. PDF invoice with your country's mandatory details. Payment link. Guided reminders. One single flow, perfectly finished.",
    "PDF + mentions FR": "PDF + FR details",
    "PDF + mentions BE": "PDF + BE details",
    "PDF + mentions CH": "PDF + CH details",
    "Sales tax US (manuelle)": "US sales tax (manual)",
    "E-facture certifiée (PDP France, Peppol Belgique, QR SIX) : via plateforme agréée à brancher. Ce document reste un PDF.": "Certified e-invoicing (French PDP, Belgian Peppol, SIX QR): via a certified platform to connect. This document remains a PDF.",
    "🇫🇷 France · PDF + mentions": "🇫🇷 France · PDF + details",
    "🇧🇪 Belgique · PDF + mentions": "🇧🇪 Belgium · PDF + details",
    "🇨🇭 Suisse · PDF + mentions": "🇨🇭 Switzerland · PDF + details",
    "🇺🇸 United States · Sales tax (manuelle)": "🇺🇸 United States · Sales tax (manual)",
    "PDF avec mentions du pays. E-facture certifiée (FR PDP dès 09/2027, BE Peppol-BIS obligatoire) via plateforme agréée à brancher. Paiements par Stripe. Rendus de démonstration tant que les clés API ne sont pas branchées.": "PDF with your country's details. Certified e-invoicing (FR PDP from 09/2027, BE Peppol-BIS mandatory) via a certified platform to connect. Payments by Stripe. Demo output until API keys are connected.",
    "🇫🇷 France — PDF + mentions (PDP à brancher)": "🇫🇷 France — PDF + details (PDP to connect)",
    "🇧🇪 Belgique — PDF + mentions (Peppol à brancher)": "🇧🇪 Belgium — PDF + details (Peppol to connect)",
    "🇨🇭 Suisse — PDF + mentions": "🇨🇭 Switzerland — PDF + details",
    "🇺🇸 United States — Sales tax (manuelle)": "🇺🇸 United States — Sales tax (manual)",
    "Copie chiffrée de tout l'appareil. Même nous ne pouvons pas la lire. Seule protection contre perte ou vol du téléphone.": "Encrypted copy of the whole device. Even we cannot read it. Your only protection against loss or theft of the phone.",
    "Fait foi de bon pour accord": "Timestamped approval image (not a certified signature)",
    "Identité éditeur à compléter dans legal.html avant tout encaissement réel. Interface FR/EN ; régime fiscal FR · BE · CH · US uniquement.": "Publisher identity must be completed in legal.html before any real collection. FR/EN interface; FR · BE · CH · US tax rules only."
  };

  /* 24 langues officielles de l'UE (nom natif = libellé affiché, norme Switch) :
     fr + en sont inline (instantanés) ; les 22 autres se chargent à la demande
     depuis lang/<code>.js puis sont mises en cache (SW) pour le hors-ligne. */
  var LANGS = {
    fr: "Français", en: "English", bg: "Български", es: "Español", cs: "Čeština",
    da: "Dansk", de: "Deutsch", et: "Eesti", el: "Ελληνικά", ga: "Gaeilge",
    hr: "Hrvatski", it: "Italiano", lv: "Latviešu", lt: "Lietuvių", hu: "Magyar",
    mt: "Malti", nl: "Nederlands", pl: "Polski", pt: "Português", ro: "Română",
    sk: "Slovenčina", sl: "Slovenščina", fi: "Suomi", sv: "Svenska"
  };
  var LOADED = { fr: null, en: EN };
  function loadLang(code) {
    return new Promise(function (resolve) {
      if (LOADED[code] !== undefined) return resolve(LOADED[code]);
      var s = document.createElement("script");
      s.src = "lang/" + code + ".js";
      s.onload = function () {
        var d = (window.ENCAISSE_LANGS || {})[code];
        LOADED[code] = d || null;
        try { s.remove(); } catch (e) {}
        resolve(LOADED[code]);
      };
      s.onerror = function () { LOADED[code] = null; try { s.remove(); } catch (e) {} resolve(null); };
      document.head.appendChild(s);
    });
  }
  /* Changement de langue complet : charge le dictionnaire si besoin, applique,
     persiste. Le français reste la langue de repli (clé absente => français). */
  function setAppLang(code) {
    code = LANGS[code] ? code : "en";
    var done = function () { setLang(code); applyI18n(); return code; };
    if (code === "fr" || code === "en" || LOADED[code] !== undefined) { done(); return Promise.resolve(code); }
    return loadLang(code).then(done);
  }

  var LANG = null;

  function detect() {
    try {
      var stored = localStorage.getItem("encaisse.lang");
      if (stored && LANGS[stored]) return stored;
    } catch (e) {}
    var nav = "";
    try { nav = (navigator.language || navigator.userLanguage || "fr").toLowerCase(); } catch (e) {}
    var pre = nav.split("-")[0];
    if (LANGS[pre]) return pre;
    return "en";
  }

  function t(s, vars) {
    if (s == null) return s;
    var out = String(s);
    if (LANG === "en") {
      var e = EN[out];
      if (e !== undefined) out = e;
    } else if (LANG !== "fr") {
      var dd = LOADED[LANG];
      if (dd && dd[out] !== undefined) out = dd[out];
    }
    if (vars) {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) {
          out = out.split("{" + k + "}").join(String(vars[k]));
        }
      }
    }
    return out;
  }

  function setLang(l) {
    LANG = LANGS[l] ? l : "fr";
    window.ENCAISSE_LANG = LANG;
    try { localStorage.setItem("encaisse.lang", LANG); } catch (e) {}
    document.documentElement.lang = LANG;
    document.documentElement.setAttribute("data-lang", LANG);
  }

  function applyI18n() {
    document.documentElement.lang = LANG;
    document.documentElement.setAttribute("data-lang", LANG);
    var i, els;
    els = document.querySelectorAll("[data-i18n]");
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    els = document.querySelectorAll("[data-i18n-html]");
    for (i = 0; i < els.length; i++) els[i].innerHTML = t(els[i].getAttribute("data-i18n-html"));
    els = document.querySelectorAll("[data-i18n-ph]");
    for (i = 0; i < els.length; i++) els[i].placeholder = t(els[i].getAttribute("data-i18n-ph"));
  }

  LANG = detect();
  window.ENCAISSE_LANG = LANG;
  window.ENCAISSE_I18N = EN;
  window.ENCAISSE_LANG_LIST = LANGS;
  window.t = t;
  window.setLang = setLang;
  window.setAppLang = setAppLang;
  window.getLang = function () { return LANG; };
  window.applyI18n = applyI18n;
})();
