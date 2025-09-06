require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

// --- Servir archivos estáticos desde el directorio 'public' ---
app.use(express.static(path.join(__dirname, '../public')));


// --- Configuración de la Base de Datos ---
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || undefined, // CORRECCIÓN DEFINITIVA
    database: process.env.DB_NAME || 'control_financiero'
};

let db;
async function connectDatabase() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Conexión exitosa a la base de datos MySQL.');
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
        process.exit(1);
    }
}

connectDatabase();

// --- Middleware de Autenticación JWT ---
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret', (err, user) => {
            if (err) {
                return res.sendStatus(403); // Token inválido
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401); // No hay token
    }
};

// --- Rutas de Autenticación ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Usuario y contraseña son requeridos.');
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
        await db.query(query, [username, hashedPassword]);
        res.status(201).send('Usuario registrado exitosamente.');
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).send('El nombre de usuario ya existe.');
        }
        res.status(500).send('Error al registrar el usuario: ' + err.message);
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = 'SELECT * FROM users WHERE username = ?';
        const [users] = await db.query(query, [username]);
        if (users.length === 0) {
            return res.status(401).send('Credenciales incorrectas.');
        }
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).send('Credenciales incorrectas.');
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET || 'your_default_secret', { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).send('Error en el servidor: ' + err.message);
    }
});

// --- Rutas de la API para Transacciones (Protegidas) ---

// GET para exportar a CSV
app.get('/api/transactions/export/csv', authenticateJWT, async (req, res) => {
    try {
        const query = 'SELECT id, date, description, amount, type, category, account FROM transactions WHERE user_id = ? ORDER BY date DESC';
        const [transactions] = await db.query(query, [req.user.userId]);

        if (transactions.length === 0) {
            return res.status(404).send('No hay transacciones para exportar.');
        }

        const csvHeaders = ['ID', 'Fecha', 'Descripción', 'Monto', 'Tipo', 'Categoría', 'Cuenta'];
        
        const escapeCsvField = (field) => {
            if (field === null || field === undefined) return '';
            const stringField = String(field);
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        const csvRows = transactions.map(tx => {
            const date = new Date(tx.date).toLocaleDateString('es-ES');
            const row = [
                tx.id,
                date,
                escapeCsvField(tx.description),
                tx.amount,
                escapeCsvField(tx.type),
                escapeCsvField(tx.category),
                escapeCsvField(tx.account)
            ];
            return row.join(',');
        });

        const csvString = [csvHeaders.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="transacciones.csv"');
        res.status(200).send(csvString);

    } catch (err) {
        console.error("Error exporting to CSV:", err);
        res.status(500).send('Error al exportar las transacciones a CSV.');
    }
});

// GET todas las transacciones del usuario
app.get('/api/transactions', authenticateJWT, async (req, res) => {
    try {
        const query = 'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC';
        const [transactions] = await db.query(query, [req.user.userId]);
        res.json(transactions);
    } catch (err) {
        res.status(500).send('Error al obtener transacciones: ' + err.message);
    }
});

// POST para crear una nueva transacción
app.post('/api/transactions', authenticateJWT, async (req, res) => {
    const { type, date, description, amount, category, account } = req.body;
    const { userId } = req.user;
    const query = 'INSERT INTO transactions (user_id, type, date, description, amount, category, account) VALUES (?, ?, ?, ?, ?, ?, ?)';
    try {
        const [result] = await db.query(query, [userId, type, date, description, amount, category, account]);
        const newTransaction = { id: result.insertId, user_id: userId, type, date, description, amount, category, account };
        res.status(201).json(newTransaction);
    } catch (err) {
        res.status(500).send('Error al crear la transacción: ' + err.message);
    }
});

// PUT para actualizar una transacción existente
app.put('/api/transactions/:id', authenticateJWT, async (req, res) => {
    const { id: transactionId } = req.params;
    const { userId } = req.user;
    const { type, date, description, amount, category, account } = req.body;

    if (!type || !date || !description || !amount || !account) {
        return res.status(400).send('Faltan campos requeridos para la actualización.');
    }

    const query = `
        UPDATE transactions 
        SET type = ?, date = ?, description = ?, amount = ?, category = ?, account = ? 
        WHERE id = ? AND user_id = ?
    `;

    try {
        const [result] = await db.query(query, [type, date, description, amount, category, account, transactionId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).send('Transacción no encontrada o no tienes permiso para editarla.');
        }
        const updatedTransaction = { id: parseInt(transactionId), user_id: userId, type, date, description, amount, category, account };
        res.status(200).json(updatedTransaction);
    } catch (err) {
        console.error("Error updating transaction:", err);
        res.status(500).send('Error al actualizar la transacción.');
    }
});

// DELETE una transacción
app.delete('/api/transactions/:id', authenticateJWT, async (req, res) => {
    const { id: transactionId } = req.params;
    const { userId } = req.user;
    const query = 'DELETE FROM transactions WHERE id = ? AND user_id = ?';
    try {
        const [result] = await db.query(query, [transactionId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).send('Transacción no encontrada o no tienes permiso para eliminarla.');
        }
        res.status(200).send({ message: 'Transacción eliminada correctamente.' });
    } catch (err) {
        res.status(500).send('Error al eliminar la transacción: ' + err.message);
    }
});

// --- Rutas para servir las páginas HTML (manejador catch-all) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- Iniciar el Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
