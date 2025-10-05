import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from "express-rate-limit";
import fileType from 'file-type';
import crypto from 'crypto';
import sharp from 'sharp';

// Directorio temporal para subir archivos
const tempDir = path.resolve(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

dotenv.config();
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

const app = express();
app.use(cors());
app.use(express.json());

// Crear nueva entrada 
export const createEntryLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 segundos
  max: 1,
  message: { error: "Too many new entries, please wait before creating again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Editar entrada 
export const editEntryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3,
  message: { error: "Too many edit requests, slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Subir imágenes
export const uploadLimiter = rateLimit({
  windowMs: 15 * 1000, // 15 segundos
  max: 2,
  message: { error: "Too many image uploads, please wait." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configuración multer
const upload = multer({
  dest: tempDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  },
});


// Base de datos
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// JWT middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET!, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

const generateToken = (payload: object) => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as any,
  };
  return jwt.sign(payload, process.env.JWT_SECRET!, options);
};

// --- RUTAS AUTH ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res
      .status(400)
      .json({ message: 'Username, email and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    const userId = (result as any).insertId;
    const token = generateToken({ id: userId, username });
    res.json({ token, user: { id: userId, username, email } });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage.includes('username'))
        return res.status(400).json({ message: 'Username already taken' });
      if (error.sqlMessage.includes('email'))
        return res.status(400).json({ message: 'Email already registered' });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

const loginAttempts: Record<string, { count: number; lastAttempt: number }> = {};
const MAX_ATTEMPTS = 5; // máximo intentos fallidos
const LOCKOUT_TIME = 5 * 60 * 1000; // 5 minutos

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = getClientIp(req);
  const now = Date.now();

  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });

  // Verificar si está bloqueado
  if (loginAttempts[ip] && loginAttempts[ip].count >= MAX_ATTEMPTS) {
    const timePassed = now - loginAttempts[ip].lastAttempt;
    if (timePassed < LOCKOUT_TIME) {
      const minutesLeft = Math.ceil((LOCKOUT_TIME - timePassed) / 60000);
      return res.status(429).json({
        message: `Too many login attempts. Try again in ${minutesLeft} minutes.`,
      });
    } else {
      // resetear contador después del lockout
      delete loginAttempts[ip];
    }
  }

  try {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    const user = (rows as any)[0];

    if (!user) {
      registerFailedAttempt(ip, now);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      registerFailedAttempt(ip, now);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // login limpiar intentos
    delete loginAttempts[ip];

    const token = generateToken({ id: user.id, username: user.username });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// helper
function registerFailedAttempt(ip: string, now: number) {
  if (!loginAttempts[ip]) {
    loginAttempts[ip] = { count: 1, lastAttempt: now };
  } else {
    loginAttempts[ip].count++;
    loginAttempts[ip].lastAttempt = now;
  }
}


// Obtener usuario actual
/*app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, email, username FROM users WHERE id = ?',
      [req.user.id]
    );
    const user = (rows as any)[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});*/

// --- RUTAS POSTS ---
// Crear post
app.post('/api/mood-entry', authenticateToken, createEntryLimiter, async (req: any, res) => {
  const { description, mood, photo_url } = req.body;
  const userId = req.user.id;
  try {
    const sanitizedDesc = description
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const [result] = await db.execute(
      'INSERT INTO posts (user_id, description, mood, photo) VALUES (?, ?, ?, ?)',
      [userId, sanitizedDesc, mood, photo_url]
    );

    const insertId = (result as any).insertId;
    const [rows] = await db.execute(
      'SELECT id, user_id, description, mood, photo, created_at, updated_at FROM posts WHERE id=?',
      [insertId]
    );

    const newPost = (rows as any)[0];
    newPost.photo_url = newPost.photo || null;


    res.json({ entry: newPost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Actualizar post
app.put('/api/mood-entry/:id', authenticateToken, editEntryLimiter, async (req: any, res) => {
  const postId = req.params.id;
  const { description, mood, photo_url } = req.body;

  console.log('=== UPDATE DEBUG ===');
  console.log('Received data:', { postId, description, mood, photo_url });

  try {
    // Buscar post existente
    const [rows] = await db.execute(
      'SELECT * FROM posts WHERE id=? AND user_id=?',
      [postId, req.user.id]
    );
    const post = (rows as any)[0];
    if (!post) {
      console.log('Post not found');
      return res.status(404).json({ message: 'Post not found' });
    }

    console.log('Existing post:', post);

    // Sanitizar descripción
    const sanitizedDesc = description?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || post.description;

    // Determinar foto final
    let finalPhoto = post.photo; // Mantener foto actual por defecto

    // Si viene nueva foto, validar que exista
    if (photo_url && photo_url !== post.photo) {
      const newPhotoPath = path.resolve(process.cwd(), 'storage/uploads', photo_url);
      
      console.log('Checking new photo at:', newPhotoPath);
      
      if (fs.existsSync(newPhotoPath)) {
        // La nueva foto existe, actualizar
        finalPhoto = photo_url;
        console.log('Using new photo:', finalPhoto);
        
        // Borrar foto anterior solo si es diferente
        if (post.photo && post.photo !== photo_url) {
          const oldPath = path.resolve(process.cwd(), 'storage/uploads', post.photo);
          if (fs.existsSync(oldPath)) {
            console.log('Deleting old photo:', oldPath);
            fs.unlinkSync(oldPath);
          }
        }
      } else {
        console.log('New photo not found, keeping current photo');
        // Si la nueva foto no existe, mantener la actual
        finalPhoto = post.photo;
      }
    }

    console.log('Final data for update:', {
      description: sanitizedDesc,
      mood: mood,
      photo: finalPhoto,
      postId: postId
    });

    // Actualizar post en BD
    await db.execute(
      'UPDATE posts SET description=?, mood=?, photo=?, updated_at=NOW() WHERE id=?',
      [sanitizedDesc, mood, finalPhoto, postId]
    );

    console.log('Database updated successfully');

    // Traer post actualizado
    const [updatedRows] = await db.execute(
      'SELECT id, user_id, description, mood, photo, created_at, updated_at FROM posts WHERE id=?',
      [postId]
    );
    const updatedPost = (updatedRows as any)[0];
    
    // Solo devolver el nombre del archivo
    updatedPost.photo_url = updatedPost.photo || null;

    console.log('Returning updated post:', updatedPost);
    res.json({ entry: updatedPost });

  } catch (error: any) {
    console.error('=== UPDATE ERROR ===');
    console.error('Error details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Obtener posts del usuario actual
app.get('/api/mood-entry/user', authenticateToken, async (req: any, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, description, mood, photo FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    let entry = (rows as any)[0] || null;
    if (entry && entry.photo) entry.photo_url = `${entry.photo}`;
    res.json({ entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Upload seguro ---
app.post(
  '/api/mood-entry/upload',
  authenticateToken,
  uploadLimiter,
  upload.single('photo'),
  async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const tempPath = req.file.path;

      // Detectar tipo real con file-type
      const detected = await fileType.fromFile(tempPath);
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!detected || !allowedMimes.includes(detected.mime)) {
        fs.unlinkSync(tempPath);
        return res.status(400).json({ message: 'Invalid file type' });
      }

      // Validar que no esté corrupta con sharp
      try {
        await sharp(tempPath).metadata();
      } catch (err) {
        fs.unlinkSync(tempPath);
        return res.status(400).json({ message: 'Corrupted or invalid image' });
      }

      // Guardar nueva foto con nombre seguro
      const ext = '.' + detected.ext;
      const filename = `${req.user.id}_${crypto.randomUUID()}${ext}`;
      const uploadDir = path.resolve(process.cwd(), 'storage/uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const finalPath = path.join(uploadDir, filename);

      // Copiar + borrar archivo temporal
      await fs.promises.copyFile(tempPath, finalPath);
      await fs.promises.unlink(tempPath);

      // Actualizar la BD con la nueva foto
      const [rows] = await db.execute(
        'SELECT photo FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        [req.user.id]
      );
      const lastPhoto = (rows as any)[0]?.photo;

      try {
        // Actualizamos la BD en la entrada más reciente
        await db.execute(
          'UPDATE posts SET photo=? WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
          [filename, req.user.id]
        );

        //Solo después de actualizar la BD borramos la foto anterior
        if (lastPhoto) {
          const oldPath = path.resolve(uploadDir, lastPhoto);
          if (fs.existsSync(oldPath)) {
            await fs.promises.unlink(oldPath);
          }
        }
      } catch (dbErr) {
        console.error('Error updating DB, keeping old photo:', dbErr);
        // Borrar la nueva foto para no dejar archivos huérfanos
        await fs.promises.unlink(finalPath);
        return res.status(500).json({ message: 'Failed to save photo' });
      }

      res.json({ photo_url: filename });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ message: 'Upload failed' });
    }
  }
);



// --- Servir fotos privadas ---
app.get('/uploads/:filename', authenticateToken, (req: any, res) => {
  const { filename } = req.params;

  if (!filename.startsWith(`${req.user.id}_`)) {
    console.error('Access denied for file:', filename);
    return res.status(403).json({ message: 'Forbidden' });
  }

  const filePath = path.resolve(process.cwd(), 'storage/uploads', filename);
  console.log('Looking for file at:', filePath);

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return res.status(404).json({ message: 'File not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };

  const mime = mimeMap[ext] || 'application/octet-stream';

  // Headers extra de seguridad
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  console.log('Serving file:', filename, 'with MIME:', mime);
  res.sendFile(filePath);
});

// Dar like a un post
/*app.post(
  '/api/mood-entry/:id/like',
  authenticateToken,
  async (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      // Verificar si ya dio like
      const [existing] = await db.execute(
        'SELECT * FROM post_likes WHERE post_id=? AND user_id=?',
        [postId, userId]
      );
      if ((existing as any).length > 0) {
        return res.status(400).json({ message: 'Ya diste like' });
      }

      // Insertar like
      await db.execute('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [
        postId,
        userId,
      ]);

      // Contar likes totales
      const [likesRows] = await db.execute(
        'SELECT user_id FROM post_likes WHERE post_id=?',
        [postId]
      );
      const likesArray = (likesRows as any).map((l: any) => l.user_id);

      res.json({ likes: likesArray, likesCount: likesArray.length, likedByUser: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);*/

/*app.get('/api/mood-entry/all', authenticateToken, async (req: any, res) => {
  try {
    const moodFilter = req.query.mood ? 'WHERE mood=?' : '';
    const params = req.query.mood ? [req.query.mood] : [];

    const [postsRows] = await db.execute(
      `SELECT p.id, p.user_id, u.username, p.description, p.mood, p.photo, p.created_at
       FROM posts p JOIN users u ON p.user_id=u.id
       ${moodFilter}
       ORDER BY p.created_at DESC`,
      params
    );

    // Agregar array de likes a cada post
    const posts = await Promise.all(
      (postsRows as any).map(async (post: any) => {
        const [likesRows] = await db.execute(
          'SELECT user_id FROM post_likes WHERE post_id=?',
          [post.id]
        );
        const likesArray = (likesRows as any).map((l: any) => l.user_id);
        return { ...post, likes: likesArray, photo_url: post.photo || null };
      })
    );

    res.json({ entries: posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});*/

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
