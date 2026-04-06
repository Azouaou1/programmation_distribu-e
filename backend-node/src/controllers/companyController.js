'use strict';

const { User, Event } = require('../models');

/**
 * GET /api/companies/:id/
 * Profil public d'une company — accessible sans authentification.
 * Retourne les infos publiques + les events publiés.
 * Ne retourne PAS recovery_email ni company_identifier.
 */
async function getCompanyPublicProfile(req, res) {
  const company = await User.findOne({
    where: { id: req.params.id, role: 'COMPANY', is_active: true },
    include: [{ association: 'tags', attributes: ['id', 'name'], through: { attributes: [] } }],
  });

  if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });

  // Events publiés de la company
  const publishedEvents = await Event.findAll({
    where: { company_id: company.id, status: 'PUBLISHED' },
    attributes: ['id', 'title', 'date_start', 'format', 'capacity'],
    include: [{ association: 'registrations', attributes: ['status'] }],
    order: [['date_start', 'ASC']],
  });

  const events = publishedEvents.map(e => {
    const confirmed = (e.registrations || []).filter(r => r.status === 'CONFIRMED').length;
    return {
      id: e.id,
      title: e.title,
      date_start: e.date_start,
      format: e.format,
      spots_remaining: e.capacity - confirmed,
    };
  });

  return res.json({
    id: company.id,
    company_name: company.company_name,
    company_logo: company.company_logo || null,
    company_description: company.company_description,
    website_url: company.website_url,
    youtube_url: company.youtube_url,
    linkedin_url: company.linkedin_url,
    twitter_url: company.twitter_url,
    instagram_url: company.instagram_url,
    facebook_url: company.facebook_url,
    tags: (company.tags || []).map(t => ({ id: t.id, name: t.name })),
    events,
    member_since: company.date_joined,
  });
}

module.exports = { getCompanyPublicProfile };
