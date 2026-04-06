'use strict';

const express = require('express');
const router = express.Router();
const { getCompanyPublicProfile } = require('../controllers/companyController');

router.get('/:id/', getCompanyPublicProfile);

module.exports = router;
