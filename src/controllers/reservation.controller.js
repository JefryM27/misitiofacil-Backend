// src/controllers/reservation.controller.js
import Reservation from '../models/reservation.js';
import Business from '../models/business.js';
import Service from '../models/service.js'; // Necesario para obtener duración y precio
import { asyncHandler } from '../middleware/asyncHandler.js';
import { constants, logger } from '../config/index.js';
import mongoose from 'mongoose';

const { USER_ROLES } = constants;

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const parseDate = (v) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const parsePagination = (q) => {
  const page = Math.max(1, parseInt(q.page ?? 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? 10, 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const userCanSeeReservation = async (user, reservation) => {
  if (!user || !reservation) return false;
  if (user.role === USER_ROLES.ADMIN) return true;
  if (user.role === USER_ROLES.CLIENT) return String(reservation.client) === String(user.id);
  if (user.role === USER_ROLES.OWNER) {
    const biz = await Business.findById(reservation.business).select('owner').lean();
    return !!biz && String(biz.owner) === String(user.id);
  }
  return false;
};

const userCanManageReservation = async (user, reservation) => {
  if (!user || !reservation) return false;
  if (user.role === USER_ROLES.ADMIN) return true;
  if (user.role === USER_ROLES.OWNER) {
    const biz = await Business.findById(reservation.business).select('owner').lean();
    return !!biz && String(biz.owner) === String(user.id);
  }
  return false;
};

// ───────────────────────────────────────────────────────────────
// Controllers
// ───────────────────────────────────────────────────────────────

/**
 * Crear una reserva
 * Body: { business, service, dateTime, notes, customerName, customerEmail, customerPhone }
 */
const create = asyncHandler(async (req, res) => {
  const { business, service, dateTime, notes, customerName, customerEmail, customerPhone } = req.body || {};

  // Validaciones mínimas
  if (!business || !service || !dateTime) {
    return res.status(400).json({ 
      success: false, 
      error: 'business, service y dateTime son requeridos' 
    });
  }
  
  if (!isObjectId(business) || !isObjectId(service)) {
    return res.status(400).json({ 
      success: false, 
      error: 'IDs inválidos (business/service)' 
    });
  }
  
  const when = parseDate(dateTime);
  if (!when) {
    return res.status(400).json({ 
      success: false, 
      error: 'dateTime inválido (ISO requerido)' 
    });
  }
  
  if (when.getTime() < Date.now()) {
    return res.status(400).json({ 
      success: false, 
      error: 'dateTime debe estar en el futuro' 
    });
  }

  // Validar información del cliente para invitados
  if (!customerName || !customerEmail || !customerPhone) {
    return res.status(400).json({
      success: false,
      error: 'customerName, customerEmail y customerPhone son requeridos para reservas'
    });
  }

  try {
    // ✅ OBTENER INFORMACIÓN DEL SERVICIO PARA DURACIÓN Y PRECIO
    const serviceData = await Service.findById(service).lean();
    if (!serviceData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Servicio no encontrado' 
      });
    }

    // ✅ VALIDAR QUE EL NEGOCIO EXISTE
    const businessData = await Business.findById(business).lean();
    if (!businessData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Negocio no encontrado' 
      });
    }

    // Si es OWNER, validar que es dueño del negocio
    if (req.user?.role === USER_ROLES.OWNER) {
      if (String(businessData.owner) !== String(req.user.id)) {
        return res.status(403).json({ 
          success: false, 
          error: 'No puedes crear reservas en negocios de terceros' 
        });
      }
    }

    // ✅ PREPARAR DATOS PARA EL MODELO
    const reservationData = {
      business,
      service,
      dateTime: when,
      notes: notes || '',
      
      // ✅ DURACIÓN REQUERIDA - Tomar del servicio
      duration: serviceData.duration || 60, // fallback a 60 minutos
      
      // ✅ INFORMACIÓN DE PAGO REQUERIDA
      payment: {
        method: 'cash', // default
        amount: serviceData.price || 0, // precio del servicio
        currency: 'CRC',
        isPaid: false
      },
      
      // ✅ CLIENTE INVITADO (siguiendo el schema)
      guestClient: {
        name: customerName.trim(),
        email: customerEmail.toLowerCase().trim(),
        phone: customerPhone.trim()
      },
      
      // Cliente registrado si existe
      client: req.user?.id || null,
      
      status: 'pending',
      
      // Metadata adicional
      source: 'web',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent') || ''
    };

    // ✅ CREAR LA RESERVA
    const reservation = await Reservation.create(reservationData);

    logger.info('Reserva creada exitosamente', { 
      reservationId: reservation._id, 
      business, 
      service,
      customerEmail,
      by: req.user?.id || 'guest'
    });

    res.status(201).json({ 
      success: true, 
      message: 'Reserva creada exitosamente',
      data: { reservation } 
    });

  } catch (error) {
    logger.error('Error creando reserva', { 
      error: error.message,
      business,
      service,
      customerEmail,
      by: req.user?.id || 'guest'
    });

    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Datos de reserva inválidos',
        details: validationErrors
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al crear la reserva'
    });
  }
});

/**
 * Listar reservas (admin/owner)
 * Query: businessId, serviceId, status, from, to, page, limit
 */
const list = asyncHandler(async (req, res) => {
  const { businessId, serviceId, status, from, to } = req.query || {};
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};

  if (businessId) {
    if (!isObjectId(businessId)) return res.status(400).json({ success: false, error: 'businessId inválido' });
    filter.business = businessId;
  }
  if (serviceId) {
    if (!isObjectId(serviceId)) return res.status(400).json({ success: false, error: 'serviceId inválido' });
    filter.service = serviceId;
  }
  if (status) {
    const allowed = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `status debe ser uno de: ${allowed.join(', ')}` });
    }
    filter.status = status;
  }
  if (from || to) {
    const $gte = from ? parseDate(from) : null;
    const $lte = to ? parseDate(to) : null;
    if ((from && !$gte) || (to && !$lte)) {
      return res.status(400).json({ success: false, error: 'from/to deben ser date-time ISO' });
    }
    filter.dateTime = {};
    if ($gte) filter.dateTime.$gte = $gte;
    if ($lte) filter.dateTime.$lte = $lte;
  }

  // Scoping por rol:
  if (req.user?.role === USER_ROLES.OWNER) {
    const myBizIds = await Business.find({ owner: req.user.id }).distinct('_id');
    if (myBizIds.length === 0) {
      return res.json({ success: true, data: { items: [], pagination: { page, limit, total: 0, totalPages: 0 } } });
    }
    if (filter.business) {
      if (!myBizIds.map(String).includes(String(filter.business))) {
        return res.json({ success: true, data: { items: [], pagination: { page, limit, total: 0, totalPages: 0 } } });
      }
    } else {
      filter.business = { $in: myBizIds };
    }
  } else if (req.user?.role === USER_ROLES.CLIENT) {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .populate('business', 'name location')
      .populate('service', 'name duration price')
      .sort({ dateTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Reservation.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  });
});

/**
 * Listar reservas del usuario autenticado (cliente)
 */
const listMine = asyncHandler(async (req, res) => {
  const { status } = req.query || {};
  const { page, limit, skip } = parsePagination(req.query);

  const filter = { client: req.user.id };
  if (status) {
    const allowed = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `status debe ser uno de: ${allowed.join(', ')}` });
    }
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .populate('business', 'name location')
      .populate('service', 'name duration price')
      .sort({ dateTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Reservation.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  });
});

/**
 * Obtener una reserva por ID
 */
const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

  const r = await Reservation.findById(id)
    .populate('business', 'name location')
    .populate('service', 'name duration price');
    
  if (!r) return res.status(404).json({ success: false, error: 'Reserva no encontrada' });

  const canSee = await userCanSeeReservation(req.user, r);
  if (!canSee) return res.status(403).json({ success: false, error: 'Acceso denegado' });

  res.json({ success: true, data: { reservation: r } });
});

/**
 * Actualizar estado de una reserva (owner/admin)
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

  const allowed = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, error: `status debe ser uno de: ${allowed.join(', ')}` });
  }

  const r = await Reservation.findById(id);
  if (!r) return res.status(404).json({ success: false, error: 'Reserva no encontrada' });

  const canManage = await userCanManageReservation(req.user, r);
  if (!canManage) return res.status(403).json({ success: false, error: 'Acceso denegado' });

  r.status = status;
  if (status === 'confirmed') r.confirmedAt = new Date();
  if (status === 'cancelled') r.cancelledAt = new Date();
  if (status === 'completed') r.completedAt = new Date();
  
  await r.save();

  logger.info('Reserva: estado actualizado', { id: r._id, status, by: req.user?.id });
  res.json({ success: true, message: 'Estado actualizado', data: { reservation: r } });
});

/**
 * Cancelar una reserva
 */
const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

  const r = await Reservation.findById(id);
  if (!r) return res.status(404).json({ success: false, error: 'Reserva no encontrada' });

  const isOwnerManage = await userCanManageReservation(req.user, r);
  const isClientSelf = String(r.client) === String(req.user?.id);
  if (!(req.user?.role === USER_ROLES.ADMIN || isOwnerManage || isClientSelf)) {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }

  if (r.status === 'cancelled') {
    return res.status(400).json({ success: false, error: 'La reserva ya está cancelada' });
  }

  r.status = 'cancelled';
  r.cancelledAt = new Date();
  if (reason) r.cancellationReason = reason;

  await r.save();

  logger.warn('Reserva cancelada', { id: r._id, by: req.user?.id, role: req.user?.role });
  res.json({ success: true, message: 'Reserva cancelada', data: { reservation: r } });
});

export default {
  create,
  list,
  listMine,
  getById,
  updateStatus,
  cancel
};