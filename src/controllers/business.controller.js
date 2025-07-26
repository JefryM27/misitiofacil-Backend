import Business from '../models/business.js';

// Crear negocio
const createBusiness = async (req, res) => {
  try {
    const { name, description, phone, address } = req.body;

    const newBusiness = new Business({
      ownerId: req.user.id,
      name,
      description,
      phone,
      address
    });

    await newBusiness.save();
    res.status(201).json({ message: 'Negocio creado', business: newBusiness });
  } catch (err) {
    res.status(500).json({ message: 'Error al crear negocio', error: err.message });
  }
};

// Obtener negocio del usuario autenticado
const getMyBusiness = async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.user.id }).populate('services');
    if (!business) return res.status(404).json({ message: 'Negocio no encontrado' });
    res.json(business);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener negocio', error: err.message });
  }
};

// Actualizar negocio
const updateBusiness = async (req, res) => {
  try {
    const updated = await Business.findOneAndUpdate(
      { ownerId: req.user.id },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Negocio no encontrado' });
    res.json({ message: 'Negocio actualizado', business: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar negocio', error: err.message });
  }
};

// Eliminar negocio
const deleteBusiness = async (req, res) => {
  try {
    const deleted = await Business.findOneAndDelete({ ownerId: req.user.id });
    if (!deleted) return res.status(404).json({ message: 'Negocio no encontrado' });
    res.json({ message: 'Negocio eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar negocio', error: err.message });
  }
};

// ✅ Exportación nombrada de todas las funciones
export {
  createBusiness,
  getMyBusiness,
  updateBusiness,
  deleteBusiness
};
