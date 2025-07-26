import jwt from 'jsonwebtoken';

export const auth = (roles = []) => {
  // roles puede ser string o array
  if (typeof roles === 'string') roles = [roles];

  return (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header) return res.status(401).json({ message: 'Sin token' });

      const token = header.split(' ')[1];
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ message: 'No autorizado' });
      }

      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Token inválido' });
    }
  };
};
