import { ValidationError } from './errorHandler.js';
import { constants } from '../config/index.js';

const { API_CONFIG } = constants;

// Middleware principal de paginación
export const paginate = (options = {}) => {
  const {
    defaultLimit = API_CONFIG.PAGINATION.DEFAULT_LIMIT,
    maxLimit = API_CONFIG.PAGINATION.MAX_LIMIT,
    defaultSort = '-createdAt',
    allowedSortFields = [],
    searchFields = []
  } = options;

  return (req, res, next) => {
    try {
      // Extraer parámetros de query
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || defaultLimit;
      const sort = req.query.sort || defaultSort;
      const search = req.query.search || '';
      
      // Validaciones
      if (page < 1) {
        throw new ValidationError('El número de página debe ser mayor a 0');
      }
      
      if (limit < 1) {
        throw new ValidationError('El límite debe ser mayor a 0');
      }
      
      if (limit > maxLimit) {
        throw new ValidationError(`El límite máximo es ${maxLimit}`);
      }

      // Calcular skip
      const skip = (page - 1) * limit;

      // Procesar ordenamiento
      const sortObj = processSortParam(sort, allowedSortFields);

      // Procesar búsqueda
      const searchQuery = processSearchParam(search, searchFields);

      // Agregar parámetros de paginación al request
      req.pagination = {
        page,
        limit,
        skip,
        sort: sortObj,
        search: searchQuery,
        searchTerm: search
      };

      // Función helper para aplicar paginación a una query de Mongoose
      req.applyPagination = (query) => {
        return query
          .skip(skip)
          .limit(limit)
          .sort(sortObj);
      };

      // Función helper para crear respuesta paginada
      req.createPaginatedResponse = (data, total) => {
        const totalPages = Math.ceil(total / limit);
        
        return {
          success: true,
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null
          },
          timestamp: new Date().toISOString()
        };
      };

      next();

    } catch (error) {
      next(error);
    }
  };
};

// Función para procesar parámetro de ordenamiento
const processSortParam = (sortParam, allowedFields = []) => {
  if (!sortParam) return {};

  const sortObj = {};
  
  // Dividir por comas para múltiples campos
  const sortFields = sortParam.split(',');
  
  for (const field of sortFields) {
    let fieldName = field.trim();
    let sortOrder = 1; // Ascendente por defecto
    
    // Verificar si es descendente (prefijo -)
    if (fieldName.startsWith('-')) {
      sortOrder = -1;
      fieldName = fieldName.substring(1);
    }
    
    // Verificar si es ascendente explícito (prefijo +)
    if (fieldName.startsWith('+')) {
      sortOrder = 1;
      fieldName = fieldName.substring(1);
    }
    
    // Validar campo si se especifican campos permitidos
    if (allowedFields.length > 0 && !allowedFields.includes(fieldName)) {
      console.warn(`Campo de ordenamiento no permitido: ${fieldName}`);
      continue;
    }
    
    sortObj[fieldName] = sortOrder;
  }
  
  return sortObj;
};

// Función para procesar parámetro de búsqueda
const processSearchParam = (searchTerm, searchFields = []) => {
  if (!searchTerm || searchFields.length === 0) {
    return {};
  }
  
  // Crear query de búsqueda usando $or para buscar en múltiples campos
  const searchQuery = {
    $or: searchFields.map(field => ({
      [field]: { $regex: escapedTerm, $options: 'i' }
    }))
  };
  
  return searchQuery;
};

// Middleware específico para diferentes entidades
export const paginateBusinesses = paginate({
  defaultLimit: 20,
  maxLimit: 100,
  defaultSort: '-createdAt',
  allowedSortFields: ['name', 'createdAt', 'updatedAt', 'rating', 'status'],
  searchFields: ['name', 'description', 'address', 'category']
});

export const paginateServices = paginate({
  defaultLimit: 50,
  maxLimit: 100,
  defaultSort: 'name',
  allowedSortFields: ['name', 'price', 'duration', 'createdAt', 'category'],
  searchFields: ['name', 'description', 'category']
});

export const paginateReservations = paginate({
  defaultLimit: 20,
  maxLimit: 50,
  defaultSort: '-date',
  allowedSortFields: ['date', 'status', 'createdAt', 'service'],
  searchFields: ['clientName', 'clientEmail', 'service']
});

export const paginateUsers = paginate({
  defaultLimit: 20,
  maxLimit: 100,
  defaultSort: '-createdAt',
  allowedSortFields: ['name', 'email', 'role', 'createdAt', 'lastLogin'],
  searchFields: ['name', 'email']
});

// Middleware para filtros adicionales
export const addFilters = (allowedFilters = []) => {
  return (req, res, next) => {
    const filters = {};
    
    // Procesar filtros desde query params
    for (const [key, value] of Object.entries(req.query)) {
      // Saltear parámetros de paginación
      if (['page', 'limit', 'sort', 'search'].includes(key)) {
        continue;
      }
      
      // Verificar si el filtro está permitido
      if (allowedFilters.length > 0 && !allowedFilters.includes(key)) {
        continue;
      }
      
      // Procesar diferentes tipos de filtros
      if (key.endsWith('_min') || key.endsWith('_max')) {
        // Filtros de rango numérico
        const baseField = key.replace(/_min|_max$/, '');
        const operator = key.endsWith('_min') ? '$gte' : '$lte';
        const numValue = parseFloat(value);
        
        if (!isNaN(numValue)) {
          if (!filters[baseField]) filters[baseField] = {};
          filters[baseField][operator] = numValue;
        }
      } else if (key.endsWith('_in')) {
        // Filtros de inclusión (valores separados por coma)
        const baseField = key.replace('_in', '');
        const values = value.split(',').map(v => v.trim());
        filters[baseField] = { $in: values };
      } else if (key.endsWith('_ne')) {
        // Filtros de exclusión
        const baseField = key.replace('_ne', '');
        filters[baseField] = { $ne: value };
      } else if (key.endsWith('_exists')) {
        // Filtros de existencia
        const baseField = key.replace('_exists', '');
        filters[baseField] = { $exists: value === 'true' };
      } else if (key.endsWith('_regex')) {
        // Filtros con regex
        const baseField = key.replace('_regex', '');
        filters[baseField] = { $regex: value, $options: 'i' };
      } else {
        // Filtro de igualdad simple
        filters[key] = value;
      }
    }
    
    // Agregar filtros al request
    req.filters = filters;
    
    // Función helper para combinar filtros con búsqueda
    req.getCombinedQuery = () => {
      const query = { ...req.filters };
      
      // Combinar con búsqueda si existe
      if (req.pagination.search && Object.keys(req.pagination.search).length > 0) {
        if (Object.keys(query).length > 0) {
          return { $and: [query, req.pagination.search] };
        } else {
          return req.pagination.search;
        }
      }
      
      return query;
    };
    
    next();
  };
};

// Middleware para agregar filtros específicos por entidad
export const addBusinessFilters = addFilters([
  'status', 'category', 'rating_min', 'rating_max', 
  'verified', 'featured', 'city', 'province'
]);

export const addServiceFilters = addFilters([
  'category', 'price_min', 'price_max', 'duration_min', 'duration_max',
  'available', 'businessId'
]);

export const addReservationFilters = addFilters([
  'status', 'businessId', 'serviceId', 'clientId',
  'date_min', 'date_max', 'confirmed'
]);

export const addUserFilters = addFilters([
  'role', 'verified', 'active', 'lastLogin_min', 'lastLogin_max'
]);

// Middleware para agregar ordenamiento por relevancia en búsquedas
export const addRelevanceSort = (req, res, next) => {
  // Si hay término de búsqueda, agregar score de relevancia
  if (req.pagination.searchTerm && Object.keys(req.pagination.search).length > 0) {
    // Modificar el sort para incluir relevancia
    req.pagination.sort = { score: { $meta: 'textScore' }, ...req.pagination.sort };
    
    // Función helper para aplicar búsqueda con relevancia
    req.applySearchWithRelevance = (query) => {
      return query
        .find(req.getCombinedQuery(), { score: { $meta: 'textScore' } })
        .sort(req.pagination.sort)
        .skip(req.pagination.skip)
        .limit(req.pagination.limit);
    };
  }
  
  next();
};

// Función helper para crear respuesta paginada desde el controlador
export const createPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      showing: `${((page - 1) * limit) + 1}-${Math.min(page * limit, total)} de ${total}`
    },
    timestamp: new Date().toISOString()
  };
};

// Middleware para validar parámetros de fecha en filtros
export const validateDateFilters = (req, res, next) => {
  const dateFields = ['date_min', 'date_max', 'createdAt_min', 'createdAt_max', 'updatedAt_min', 'updatedAt_max'];
  
  for (const field of dateFields) {
    if (req.query[field]) {
      const date = new Date(req.query[field]);
      if (isNaN(date.getTime())) {
        return next(new ValidationError(`Formato de fecha inválido para ${field}. Use formato ISO 8601`));
      }
      
      // Reemplazar el string con objeto Date para uso posterior
      req.query[field] = date;
    }
  }
  
  // Validar que date_min sea menor que date_max
  if (req.query.date_min && req.query.date_max && req.query.date_min > req.query.date_max) {
    return next(new ValidationError('date_min debe ser menor que date_max'));
  }
  
  next();
};

// Middleware combinado para paginación completa
export const fullPagination = (entityType = 'default') => {
  const middlewares = [validateDateFilters];
  
  switch (entityType) {
    case 'business':
      middlewares.push(paginateBusinesses, addBusinessFilters);
      break;
    case 'service':
      middlewares.push(paginateServices, addServiceFilters);
      break;
    case 'reservation':
      middlewares.push(paginateReservations, addReservationFilters);
      break;
    case 'user':
      middlewares.push(paginateUsers, addUserFilters);
      break;
    default:
      middlewares.push(paginate());
      break;
  }
  
  middlewares.push(addRelevanceSort);
  
  return middlewares;
};

// Función helper para obtener metadatos de paginación
export const getPaginationMeta = (req) => {
  return {
    page: req.pagination?.page || 1,
    limit: req.pagination?.limit || API_CONFIG.PAGINATION.DEFAULT_LIMIT,
    sort: req.pagination?.sort || {},
    filters: req.filters || {},
    searchTerm: req.pagination?.searchTerm || ''
  };
};

export default {
  paginate,
  paginateBusinesses,
  paginateServices,
  paginateReservations,
  paginateUsers,
  addFilters,
  addBusinessFilters,
  addServiceFilters,
  addReservationFilters,
  addUserFilters,
  addRelevanceSort,
  validateDateFilters,
  fullPagination,
  createPaginatedResponse,
  getPaginationMeta
};