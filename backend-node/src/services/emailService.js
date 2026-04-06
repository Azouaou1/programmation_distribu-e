'use strict';

/**
 * emailService.js — Centralisation de tous les emails de la plateforme Neurovent.
 *
 * Équivalent Node.js de emails.py (Django).
 * Toutes les fonctions d'envoi email sont ici.
 * Les contrôleurs importent uniquement la fonction dont ils ont besoin.
 *
 * Fonctions disponibles :
 *   - sendRegistrationConfirmed(registration, fromWaitlist)
 *   - sendRegistrationRejected(registration)
 *   - sendRegistrationRemovedByOrganizer(registration)
 *   - sendEventCancelled(event)
 *   - sendPasswordReset(recipientEmail, resetLink)
 *   - sendCompanyVerificationResult(company)
 */

const transporter = require('../config/email');

const FROM = process.env.EMAIL_FROM || 'Neurovent <neurovent.noreply@gmail.com>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Helpers internes ────────────────────────────────────────────────────────

function _isValidRecipient(email) {
  return Boolean(email) && !email.includes('deleted.neurovent.com');
}

async function _send(subject, textMessage, recipientEmail, htmlMessage = null) {
  if (!_isValidRecipient(recipientEmail)) return;
  try {
    const mailOptions = {
      from: FROM,
      to: recipientEmail,
      subject,
      text: textMessage,
    };
    if (htmlMessage) {
      mailOptions.html = htmlMessage;
    }
    await transporter.sendMail(mailOptions);
  } catch {
    // fail_silently — l'opération principale ne doit pas échouer à cause de l'email
  }
}

function _formatEventDetails(event) {
  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const formatLabels = { ONSITE: 'Présentiel', ONLINE: 'Distanciel', HYBRID: 'Présentiel + Live' };

  const lines = [
    `  Titre   : ${event.title}`,
    `  Début   : ${formatDate(event.date_start)}`,
    `  Fin     : ${formatDate(event.date_end)}`,
    `  Format  : ${formatLabels[event.format] || event.format}`,
  ];

  if (['ONSITE', 'HYBRID'].includes(event.format)) {
    if (event.address_full) lines.push(`  Adresse : ${event.address_full}`);
    if (event.address_city) {
      lines.push(`  Ville   : ${event.address_city}${event.address_country ? `, ${event.address_country}` : ''}`);
    }
  }

  if (['ONLINE', 'HYBRID'].includes(event.format)) {
    if (event.online_platform) lines.push(`  Plateforme : ${event.online_platform}`);
    if (event.online_link) lines.push(`  Lien    : ${event.online_link}`);
  }

  return lines.join('\n');
}

// ─── Inscriptions ────────────────────────────────────────────────────────────

async function sendRegistrationConfirmed(registration, fromWaitlist = false) {
  const participant = registration.participant;
  const event = registration.event;
  const eventLink = `${FRONTEND_URL}/events/${event.id}/`;

  const intro = fromWaitlist
    ? `Bonne nouvelle ! Vous étiez sur liste d'attente pour "${event.title}" et une place vient de se libérer. Votre inscription est maintenant confirmée !\n`
    : `Votre inscription à "${event.title}" est confirmée !\n`;

  const details = _formatEventDetails(event);

  await _send(
    `Inscription confirmée — ${event.title}`,
    `Bonjour ${participant.first_name},\n\n${intro}\n─── Détails de l'événement ───\n${details}\n\nVoir l'événement : ${eventLink}\n\nÀ bientôt sur Neurovent !\n\n— L'équipe Neurovent`,
    participant.email,
  );
}

async function sendRegistrationRejected(registration) {
  const participant = registration.participant;
  const event = registration.event;
  const browseLink = `${FRONTEND_URL}/events/`;
  const dateStr = new Date(event.date_start).toLocaleDateString('fr-FR');

  await _send(
    `Inscription non retenue — ${event.title}`,
    `Bonjour ${participant.first_name},\n\nNous sommes désolés de vous informer que votre inscription à "${event.title}" (le ${dateStr}) n'a pas été retenue par l'organisateur.\n\nVous pouvez consulter d'autres événements disponibles sur Neurovent :\n${browseLink}\n\n— L'équipe Neurovent`,
    participant.email,
  );
}

async function sendRegistrationRemovedByOrganizer(registration) {
  const participant = registration.participant;
  const event = registration.event;
  const browseLink = `${FRONTEND_URL}/events/`;
  const dateStr = new Date(event.date_start).toLocaleString('fr-FR');

  await _send(
    `Inscription retirée par l'organisateur — ${event.title}`,
    `Bonjour ${participant.first_name},\n\nL'organisateur a retiré votre inscription à "${event.title}" prévu le ${dateStr}.\n\nSi vous pensez qu'il s'agit d'une erreur, nous vous invitons à contacter directement l'organisation de l'événement.\n\nVous pouvez découvrir d'autres événements sur Neurovent :\n${browseLink}\n\n— L'équipe Neurovent`,
    participant.email,
  );
}

// ─── Événements ──────────────────────────────────────────────────────────────

async function sendEventCancelled(event) {
  const { Registration } = require('../models');
  const browseLink = `${FRONTEND_URL}/events/`;
  const dateStr = new Date(event.date_start).toLocaleString('fr-FR');

  const registrations = await Registration.findAll({
    where: {
      event_id: event.id,
      status: ['CONFIRMED', 'PENDING', 'WAITLIST'],
    },
    include: [{ association: 'participant', attributes: ['first_name', 'email'] }],
  });

  for (const reg of registrations) {
    await _send(
      `Événement annulé — ${event.title}`,
      `Bonjour ${reg.participant.first_name},\n\nNous avons le regret de vous informer que l'événement "${event.title}" prévu le ${dateStr} a été annulé par l'organisateur.\n\nVotre inscription a été automatiquement annulée.\n\nD'autres événements sont disponibles sur Neurovent :\n${browseLink}\n\n— L'équipe Neurovent`,
      reg.participant.email,
    );
  }
}

// ─── Authentification ────────────────────────────────────────────────────────

async function sendPasswordReset(recipientEmail, resetLink) {
  await _send(
    'Réinitialisation de votre mot de passe — Neurovent',
    `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe sur Neurovent.\n\nCliquez sur ce lien pour choisir un nouveau mot de passe :\n${resetLink}\n\nCe lien est valable 24 heures. Après expiration, vous devrez faire une nouvelle demande.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe ne sera pas modifié.\n\n— L'équipe Neurovent`,
    recipientEmail,
  );
}

async function sendCompanyVerificationResult(company) {
  const email = company.recovery_email;
  const name = company.company_name;
  const verStatus = company.verification_status;

  let subject, body;

  if (verStatus === 'VERIFIED') {
    subject = 'Compte entreprise vérifié — Neurovent';
    body = `Bonjour,\n\nBonne nouvelle ! Le compte entreprise "${name}" a été vérifié automatiquement via le répertoire SIRENE.\n\nVous pouvez dès maintenant créer et publier des événements sur Neurovent.\n\n— L'équipe Neurovent`;
  } else if (verStatus === 'NEEDS_REVIEW') {
    subject = 'Vérification de votre compte entreprise en cours — Neurovent';
    body = `Bonjour,\n\nVotre demande de compte entreprise "${name}" est en cours de révision manuelle par notre équipe.\n\nCe processus prend généralement 1 à 2 jours ouvrés. Vous recevrez un email dès qu'une décision sera prise.\n\nSi votre dossier est incomplet, vous pourrez nous transmettre un justificatif (Kbis ou extrait RNE) via votre espace compte.\n\n— L'équipe Neurovent`;
  } else if (verStatus === 'REJECTED') {
    subject = 'Demande de compte entreprise refusée — Neurovent';
    body = `Bonjour,\n\nNous n'avons pas pu vérifier votre compte entreprise "${name}".\n\nRaisons possibles :\n  - SIRET introuvable ou invalide dans le répertoire SIRENE\n  - Établissement fermé ou radié\n\nSi vous pensez qu'il s'agit d'une erreur, contactez-nous en répondant à cet email avec un justificatif officiel (Kbis ou extrait RNE).\n\n— L'équipe Neurovent`;
  } else {
    return; // PENDING ou statut inconnu — pas d'email
  }

  await _send(subject, body, email);
}

module.exports = {
  sendRegistrationConfirmed,
  sendRegistrationRejected,
  sendRegistrationRemovedByOrganizer,
  sendEventCancelled,
  sendPasswordReset,
  sendCompanyVerificationResult,
};
