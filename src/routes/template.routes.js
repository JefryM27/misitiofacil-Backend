// src/routes/template.routes.js
/**
 * Template Routes — Public & Publish
 * - Keeps business info and services in sync for a public site via slug.
 * - Validates incoming services (name, duration, pricing.basePrice).
 * - Aligns with Service schema: { name, description, category, duration, pricing:{basePrice,currency}, isActive }
 */

import express from 'express';
import * as templateController from '../controllers/template.controller.js';

import Business from '../models/business.js';
import Service from '../models/service.js';

import { constants } from '../config/index.js';
import { requireOwner, optionalAuth, asyncHandler } from '../middleware/index.js';
import { apiSecurityMiddleware } from '../middleware/security.js';

const { APP_LIMITS, BUSINESS_STATUS } = constants;

const router = express.Router();
router.use(apiSecurityMiddleware);

// =================== TEMPLATES BÁSICAS ===================
router.get('/', optionalAuth, templateController.getPublicTemplates);
router.post('/', requireOwner, templateController.createTemplate);
router.get('/default', templateController.getDefaultTemplate);
router.get('/my', requireOwner, templateController.getMyTemplates);

// =================== PUBLICAR SELECCIÓN (antes de :slug / :id) ===================
router.post(
  '/publish',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { business = {}, services = [] } = req.body || {};

    // 1) Resolve business by slug (owner-scoped)
    const slug = String(business.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ success: false, error: 'Slug requerido' });
    }

    const doc = await Business.findOne({ owner: req.user.id, slug });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }

    // 2) Patch negocio (acepta operatingHours u openingHours desde el front)
    const patch = {
      name: business.name || doc.name,
      category: business.category || doc.category,
      description: business.description || doc.description,
      phone: business.phone || doc.phone,
      'location.address': business.address || doc?.location?.address,
      'socialMedia.website': business.website || doc?.socialMedia?.website,
      'socialMedia.instagram': business.instagram || doc?.socialMedia?.instagram,
      'socialMedia.facebook': business.facebook || doc?.socialMedia?.facebook,
    };
    if (business.coverUrl) patch['coverImage.url'] = business.coverUrl;

    const hours = business.operatingHours || business.openingHours;
    if (hours) patch.operatingHours = hours;

    await Business.findByIdAndUpdate(doc._id, { $set: patch });

    // 3) VALIDACIÓN PREVIA de servicios antes de borrar/insertar
    const errors = [];
    const normalized = [];

    // Helper: clamp/round duration
    const toValidDuration = (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const clamped = Math.max(APP_LIMITS.MIN_SERVICE_DURATION, Math.min(APP_LIMITS.MAX_SERVICE_DURATION, n));
      // múltiplo de 15
      const rounded = Math.round(clamped / 15) * 15;
      return Math.max(APP_LIMITS.MIN_SERVICE_DURATION, Math.min(APP_LIMITS.MAX_SERVICE_DURATION, rounded));
    };

    if (Array.isArray(services)) {
      for (let i = 0; i < services.length; i++) {
        const s = services[i] || {};
        const name = (s.title?.trim() || s.name?.trim() || '').toString();
        const description = (s.description?.trim() || '').toString();
        const category = (s.category || 'general').toString();
        const priceNum = Number(s.price ?? s.basePrice ?? s?.pricing?.basePrice ?? 0);
        const durationRaw = s.durationMin ?? s.duration ?? 30;
        const duration = toValidDuration(durationRaw);

        if (!name) {
          errors.push(`Servicio #${i + 1}: name/title es requerido`);
        }
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          errors.push(`Servicio #${i + 1}: price debe ser un número ≥ 0`);
        }
        if (!Number.isFinite(duration)) {
          errors.push(`Servicio #${i + 1}: duration inválida`);
        }

        // Si no hubo errores para este servicio, normalizamos
        if (errors.length === 0 || errors[errors.length - 1]?.includes(`#${i + 1}`) === false) {
          normalized.push({
            business: doc._id,
            name,
            description,
            category,
            duration,
            pricing: {
              basePrice: Math.max(0, Math.round(priceNum)), // basePrice entero (ajusta si permites decimales)
              currency: doc?.settings?.currency || 'CRC',
            },
            isActive: true,
            isPublic: true,
            // Opcional: createdBy podría ser útil para trazabilidad
            createdBy: req.user.id,
          });
        }
      }
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: 'Validación de servicios falló',
        details: errors,
      });
    }

    // 4) Reemplazar servicios: borrar y crear (simple y directo)
    await Service.deleteMany({ business: doc._id });

    if (normalized.length) {
      try {
        await Service.insertMany(normalized, { ordered: true });
      } catch (e) {
        console.error('[PUBLISH] Error insertando servicios:', e?.message, e?.code);
        return res.status(400).json({
          success: false,
          error: 'Error al guardar servicios',
          details:
            e?.writeErrors?.map((w) => w?.err?.errmsg) ||
            e?.errors ||
            e?.message ||
            'Validación Atlas/Mongoose',
        });
      }
    }

    // 5) Marcar negocio como publicado/activo
    await Business.findByIdAndUpdate(doc._id, {
      $set: { status: BUSINESS_STATUS.ACTIVE, publishedAt: doc.publishedAt || new Date() },
    });

    return res.json({ success: true, slug, id: String(doc._id) });
  })
);

// =================== RUTAS POR ID (evitar conflicto con slug) ===================
router.get('/:templateId([0-9a-fA-F]{24})', optionalAuth, templateController.getTemplateById);
router.put('/:templateId([0-9a-fA-F]{24})', requireOwner, templateController.updateTemplate);
router.delete('/:templateId([0-9a-fA-F]{24})', requireOwner, templateController.deleteTemplate);
router.post('/:templateId([0-9a-fA-F]{24})/duplicate', requireOwner, templateController.duplicateTemplate);

// =================== PÚBLICO POR SLUG ===================
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const business = await Business.findOne({ slug }).lean();
    if (!business || business.status !== BUSINESS_STATUS.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Sitio no disponible' });
    }

    // Traer servicios activos directamente (sin depender de un virtual en Business)
    const svc = await Service.find({ business: business._id, isActive: true })
      .select('name description duration pricing sortOrder isActive')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json({
      business: {
        slug: business.slug,
        name: business.name,
        category: business.category || '',
        description: business.description || '',
        phone: business.phone || '',
        address: business?.location?.address || '',
        website: business?.socialMedia?.website || '',
        instagram: business?.socialMedia?.instagram || '',
        facebook: business?.socialMedia?.facebook || '',
        coverUrl: business?.coverImage?.url || '',
        operatingHours: business?.operatingHours || {}, // útil para el FE
      },
      services: (svc || []).map((s) => ({
        serviceId: String(s._id),
        title: s.name,
        description: s.description || '',
        price: Number(s?.pricing?.basePrice ?? 0),
        durationMin: Number(s.duration || 30),
      })),
    });
  })
);

export default router;
