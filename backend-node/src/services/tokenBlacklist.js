'use strict';

/**
 * tokenBlacklist.js — Gestion de la liste noire des refresh tokens (logout).
 *
 * En production, remplacer par Redis pour la persistance entre redémarrages.
 * En développement, le Set en mémoire est suffisant.
 */

const blacklist = new Set();

/**
 * Ajoute un token à la liste noire.
 * @param {string} token — le refresh token à blacklister
 */
function blacklistToken(token) {
  blacklist.add(token);
}

/**
 * Vérifie si un token est blacklisté.
 * @param {string} token
 * @returns {boolean}
 */
function isBlacklisted(token) {
  return blacklist.has(token);
}

module.exports = { blacklistToken, isBlacklisted };
